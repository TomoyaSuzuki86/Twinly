const { stockAlerts } = require("./stock-alerts");
const {
  buildCareNotificationPayload,
  prioritizeNotificationGroup,
} = require("./care-reminders");
const {
  QUEUE_COLLECTION,
  ensureCareReminderBackfill,
} = require("./reminder-projection");
const { readApp } = require("./app-storage");
const webpush = require("web-push");
const { defineSecret } = require("firebase-functions/params");
const { onSchedule } = require("firebase-functions/v2/scheduler");

const mergeWindowMinutes = 15;
const mergeWindowMs = mergeWindowMinutes * 60 * 1000;
const webPushPrivateKey = defineSecret("TWINLY_WEB_PUSH_PRIVATE_KEY");
const publicKey = "BKEpEJv5umbr7E9b5dptGP0YgCV8EdVo13tDzYxUHrue90qhqIddPtzGjxv5eFuRnQgghz_G_9yOCZQV3QS8SQI";
const subject = "mailto:no-reply@twinly.local";

module.exports = ({ admin, db, familyAccess, getAppRefForUid, logger }) => {
  const groupCandidatesForNotification = (candidates, nowMs) => {
    const dueCandidates = candidates
      .filter((candidate) => candidate && candidate.dueAt <= nowMs)
      .sort((left, right) => left.dueAt - right.dueAt);

    if (!dueCandidates.length) return null;

    const primary = dueCandidates[0];
    const grouped = dueCandidates.filter(
      (candidate) =>
        candidate.dueAt >= primary.dueAt &&
        candidate.dueAt - primary.dueAt <= mergeWindowMs
    );
    return grouped.length ? grouped : [primary];
  };

  const validDevices = (snapshot) =>
    snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((device) =>
        device.subscription?.endpoint &&
        device.subscription?.keys?.auth &&
        device.subscription?.keys?.p256dh
      );

  const sendPushToDevices = async (uid, devices, payload) => {
    const tasks = devices.map(async (device) => {
      try {
        await webpush.sendNotification(device.subscription, JSON.stringify(payload), {
          TTL: 60 * 60,
          urgency: "high",
        });
        return { ok: true, deviceId: device.id };
      } catch (error) {
        const statusCode = error.statusCode || error.status;
        if (statusCode === 404 || statusCode === 410) {
          await db.collection("users").doc(uid).collection("devices").doc(device.id).delete();
        }
        logger.error("sendNotification failed", {
          uid,
          deviceId: device.id,
          statusCode,
          message: error.message,
        });
        return { ok: false, deviceId: device.id };
      }
    });

    const results = await Promise.all(tasks);
    return results.some((result) => result.ok);
  };

  const markQueueHandled = async (candidate, reason, nowMs) => {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(candidate.ref);
      if (!snapshot.exists) return;
      const current = snapshot.data() || {};
      if (
        current.eventId !== candidate.eventId ||
        Number(current.scheduledFor) !== candidate.dueAt
      ) return;

      transaction.set(candidate.ref, {
        status: "handled",
        lastHandledEventId: candidate.eventId,
        lastHandledOccurredAt: Math.max(
          Number(current.lastHandledOccurredAt || 0),
          candidate.occurredAt
        ),
        lastHandledReason: reason,
        lastHandledAt: admin.firestore.Timestamp.fromMillis(nowMs),
        nextReminderAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  };

  const sendFamilyCareReminders = async (familyId, notificationGroup, nowMs) => {
    let access;
    try {
      access = await familyAccess(familyId);
    } catch (error) {
      logger.warn("Reminder access unavailable", { familyId, message: error.message });
      return;
    }

    if (!access.features.careNotifications) {
      await Promise.all(notificationGroup.map((candidate) =>
        markQueueHandled(candidate, "access-disabled", nowMs)
      ));
      return;
    }

    const members = await db.collection("families").doc(familyId)
      .collection("members").where("status", "==", "active").get();

    let hadEligibleRecipient = false;
    let sentAny = false;
    let retryNeeded = false;

    for (const member of members.docs) {
      const uid = member.id;
      const [settingsSnap, devicesSnap] = await Promise.all([
        db.collection("users").doc(uid).collection("settings").doc("notifications").get(),
        db.collection("users").doc(uid).collection("devices")
          .where("notificationsEnabled", "==", true).get(),
      ]);

      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      const milkReminder = settings?.milkReminder ?? {};
      const careReminder = settings?.careReminder ?? {};
      if (careReminder.enabled === false || milkReminder.enabled === false) continue;

      const devices = validDevices(devicesSnap);
      if (!devices.length) continue;
      hadEligibleRecipient = true;

      const lastSentByKey = careReminder.lastSentByKey ?? {};
      const legacyLastSentByBaby = milkReminder.lastSentByBaby ?? {};
      const unsentGroup = notificationGroup.filter((candidate) => {
        const lastSent =
          lastSentByKey[candidate.reminderKey] ??
          (candidate.kind === "milk" ? legacyLastSentByBaby[candidate.babyId] : null);
        return lastSent?.eventId !== candidate.eventId;
      });
      if (!unsentGroup.length) continue;

      const visibleGroup = prioritizeNotificationGroup(unsentGroup);
      const deliveryResults = await Promise.all(
        visibleGroup.map((candidate) =>
          sendPushToDevices(uid, devices, buildCareNotificationPayload([candidate], nowMs))
        )
      );
      const sent = deliveryResults.length > 0 && deliveryResults.every(Boolean);
      if (!sent) {
        retryNeeded = true;
        continue;
      }

      sentAny = true;
      const nextLastSentByKey = { ...lastSentByKey };
      for (const candidate of unsentGroup) {
        nextLastSentByKey[candidate.reminderKey] = {
          eventId: candidate.eventId,
          sentAt: admin.firestore.Timestamp.fromMillis(nowMs),
        };
      }

      await settingsSnap.ref.set({
        careReminder: {
          enabled: true,
          mergeWindowMinutes,
          lastSentByKey: nextLastSentByKey,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (retryNeeded) return;

    const reason = sentAny
      ? "sent"
      : (hadEligibleRecipient ? "already-sent" : "no-recipient");
    await Promise.all(notificationGroup.map((candidate) =>
      markQueueHandled(candidate, reason, nowMs)
    ));
  };

  const sendMilkReminderNotifications = onSchedule(
    { schedule: "every 5 minutes", secrets: [webPushPrivateKey] },
    async () => {
      webpush.setVapidDetails(subject, publicKey, webPushPrivateKey.value());
      await ensureCareReminderBackfill({ db, admin, logger });

      const nowMs = Date.now();
      const dueRows = await db.collection(QUEUE_COLLECTION)
        .where("nextReminderAt", "<=", nowMs)
        .orderBy("nextReminderAt")
        .limit(100)
        .get();

      const byFamily = new Map();
      for (const row of dueRows.docs) {
        const data = row.data() || {};
        if (!data.familyId || !data.eventId || !Number.isFinite(data.scheduledFor)) continue;
        const candidate = {
          ref: row.ref,
          familyId: data.familyId,
          babyId: data.babyId,
          kind: data.kind,
          reminderKey: data.reminderKey || `${data.babyId}:${data.kind}`,
          displayName: data.displayName || `赤ちゃん${data.babyId}`,
          eventId: data.eventId,
          occurredAt: Number(data.occurredAt),
          dueAt: Number(data.scheduledFor),
        };
        const list = byFamily.get(data.familyId) || [];
        list.push(candidate);
        byFamily.set(data.familyId, list);
      }

      for (const [familyId, candidates] of byFamily) {
        const notificationGroup = groupCandidatesForNotification(candidates, nowMs);
        if (!notificationGroup) continue;
        try {
          await sendFamilyCareReminders(familyId, notificationGroup, nowMs);
        } catch (error) {
          logger.error("Queued care reminder delivery failed", {
            familyId,
            message: error?.message,
          });
        }
      }
    }
  );

  const sendStockReminderNotifications = onSchedule(
    { schedule: "every 6 hours", secrets: [webPushPrivateKey] },
    async () => {
      webpush.setVapidDetails(subject, publicKey, webPushPrivateKey.value());
      const nowMs = Date.now();
      const usersSnapshot = await db.collection("users").get();

      for (const userDoc of usersSnapshot.docs) {
        const uid = userDoc.id;
        const familyId = userDoc.data()?.activeFamilyId;
        if (!familyId) continue;

        const [settingsSnap, devicesSnap] = await Promise.all([
          db.collection("users").doc(uid).collection("settings").doc("notifications").get(),
          db.collection("users").doc(uid).collection("devices")
            .where("notificationsEnabled", "==", true).get(),
        ]);
        const devices = validDevices(devicesSnap);
        if (!devices.length) continue;

        let access;
        try {
          access = await familyAccess(familyId);
        } catch (error) {
          logger.warn("Stock reminder access unavailable", {
            uid,
            familyId,
            message: error.message,
          });
          continue;
        }
        if (!access.features.careNotifications || !access.features.stockNotifications) continue;

        const settings = settingsSnap.exists ? settingsSnap.data() : {};
        const milkReminder = settings?.milkReminder ?? {};
        const careReminder = settings?.careReminder ?? {};
        if (careReminder.enabled === false || milkReminder.enabled === false) continue;

        let appState;
        try {
          appState = await readApp(await getAppRefForUid(uid));
        } catch (error) {
          logger.warn("Stock reminder family unavailable", { uid, message: error.message });
          continue;
        }
        if (!appState) continue;

        const day = new Date(nowMs + 9 * 3600000).toISOString().slice(0, 10);
        const alerts = stockAlerts(appState, nowMs)
          .filter((alert) => settings.stockLastSent?.[alert.size] !== day);
        if (!alerts.length) continue;

        const sent = await sendPushToDevices(uid, devices, {
          title: "おむつの買い足し目安",
          body: alerts.map((alert) =>
            `${alert.size}：残り${alert.remaining}枚、約${Math.ceil(alert.daysRemaining)}日分`
          ).join(" / "),
          tag: "twinly-stock",
          url: "/",
        });
        if (sent) {
          await settingsSnap.ref.set({
            stockLastSent: {
              ...(settings.stockLastSent || {}),
              ...Object.fromEntries(alerts.map((alert) => [alert.size, day])),
            },
          }, { merge: true });
        }
      }
    }
  );

  return {
    sendMilkReminderNotifications,
    sendStockReminderNotifications,
  };
};
