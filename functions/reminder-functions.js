const { stockAlerts } = require("./stock-alerts");
const { buildCareNotificationPayload, buildSleepReminderCandidate } = require("./care-reminders");
const { readApp } = require("./app-storage");
const webpush = require("web-push");
const { defineSecret } = require("firebase-functions/params");
const { onSchedule } = require("firebase-functions/v2/scheduler");

const mergeWindowMinutes = 15;
const mergeWindowMs = mergeWindowMinutes * 60 * 1000;
const defaultMilkGaugeWindowHours = 3;
const diaperGaugeWindowMinutes = 120;
const webPushPrivateKey = defineSecret("TWINLY_WEB_PUSH_PRIVATE_KEY");
const publicKey = "BKEpEJv5umbr7E9b5dptGP0YgCV8EdVo13tDzYxUHrue90qhqIddPtzGjxv5eFuRnQgghz_G_9yOCZQV3QS8SQI";
const subject = "mailto:no-reply@twinly.local";

module.exports = ({ admin, db, familyAccess, getAppRefForUid, logger }) => {
  const clampMilkGaugeWindowHours = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return defaultMilkGaugeWindowHours;
    return Math.max(0.5, Math.min(12, parsed));
  };
  
  const buildLatestCareCandidate = ({ appState, babyId, kind, lastSentByKey, legacyLastSentByBaby, nowMs }) => {
    const events = Array.isArray(appState?.events) ? appState.events : [];
    const profiles = appState?.profiles ?? {};
    const eventType = kind === "milk" ? "milk" : "diaper";
    const latestEvent = events
      .filter(
        (event) =>
          event.babyId === babyId &&
          event.type === eventType &&
          typeof event.timestamp === "number" &&
          event.timestamp <= nowMs
      )
      .sort((left, right) => right.timestamp - left.timestamp)[0];
  
    if (!latestEvent) return null;
  
    const reminderKey = `${babyId}:${kind}`;
    const lastSent = lastSentByKey?.[reminderKey] ?? (kind === "milk" ? legacyLastSentByBaby?.[babyId] : null);
    if (lastSent?.eventId === latestEvent.id) return null;
  
    const intervalMs =
      kind === "milk"
        ? clampMilkGaugeWindowHours(profiles[babyId]?.milkGaugeWindowHours) * 60 * 60 * 1000
        : diaperGaugeWindowMinutes * 60 * 1000;
    const dueAt = latestEvent.timestamp + intervalMs;
  
    return {
      babyId,
      kind,
      reminderKey,
      displayName: profiles[babyId]?.displayName ?? `赤ちゃん${babyId}`,
      eventId: latestEvent.id,
      occurredAt: latestEvent.timestamp,
      dueAt,
      dueNow: dueAt <= nowMs,
    };
  };

  const groupCandidatesForNotification = (candidates, nowMs) => {
    const dueCandidates = candidates
      .filter((candidate) => candidate && candidate.dueNow)
      .sort((left, right) => left.dueAt - right.dueAt);
  
    if (!dueCandidates.length) return null;
  
    const primary = dueCandidates[0];
    const grouped = dueCandidates
      .filter((candidate) => candidate.dueAt - primary.dueAt <= mergeWindowMs && candidate.dueAt >= primary.dueAt);
  
    return grouped.length ? grouped : [primary];
  };
  
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
        logger.error("sendNotification failed", { uid, deviceId: device.id, statusCode, message: error.message });
        return { ok: false, deviceId: device.id };
      }
    });
  
    const results = await Promise.all(tasks);
    return results.some((result) => result.ok);
  };
  
  const sendMilkReminderNotifications = onSchedule(
    { schedule: "every 5 minutes", secrets: [webPushPrivateKey] },
    async () => {
    webpush.setVapidDetails(subject, publicKey, webPushPrivateKey.value());
  
    const nowMs = Date.now();
    const usersSnapshot = await db.collection("users").get();
  
    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;
      const familyId = userDoc.data()?.activeFamilyId;
      const [settingsSnap, devicesSnap] = await Promise.all([
        db.collection("users").doc(uid).collection("settings").doc("notifications").get(),
        db.collection("users").doc(uid).collection("devices").where("notificationsEnabled", "==", true).get(),
      ]);
  
      if (devicesSnap.empty) continue;
      if (!familyId) continue;

      let access;
      try {
        access = await familyAccess(familyId);
      } catch (error) {
        logger.warn("Reminder access unavailable", { uid, familyId, message: error.message });
        continue;
      }
      if (!access.features.careNotifications) continue;
  
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      const milkReminder = settings?.milkReminder ?? {};
      const careReminder = settings?.careReminder ?? {};
      if (careReminder.enabled === false || milkReminder.enabled === false) continue;
  
      let appState;
      try { appState = await readApp(await getAppRefForUid(uid)); }
      catch (error) { logger.warn("Reminder family unavailable", { uid, message: error.message }); continue; }
      if (!appState) continue;
  
      if (access.features.stockNotifications) {
        const day = new Date(nowMs + 9*3600000).toISOString().slice(0,10);
        const alerts = stockAlerts(appState, nowMs).filter(a => settings.stockLastSent?.[a.size] !== day);
        const stockDevices = devicesSnap.docs.map(d => ({id:d.id,...d.data()})).filter(d => d.subscription?.endpoint && d.subscription?.keys?.auth && d.subscription?.keys?.p256dh);
        if (alerts.length && stockDevices.length) {
          const sent = await sendPushToDevices(uid, stockDevices, {title:"おむつの買い足し目安",body:alerts.map(a=>`${a.size}：残り${a.remaining}枚、約${Math.ceil(a.daysRemaining)}日分`).join(" / "),tag:"twinly-stock",url:"/"});
          if(sent) await settingsSnap.ref.set({stockLastSent:{...(settings.stockLastSent||{}),...Object.fromEntries(alerts.map(a=>[a.size,day]))}},{merge:true});
        }
      }
      const lastSentByKey = careReminder.lastSentByKey ?? {};
      const legacyLastSentByBaby = milkReminder.lastSentByBaby ?? {};
      const candidates = ["A", "B"].flatMap((babyId) => {
        const careCandidates = ["milk", "diaper"]
          .map((kind) =>
            buildLatestCareCandidate({
              appState,
              babyId,
              kind,
              lastSentByKey,
              legacyLastSentByBaby,
              nowMs,
            })
          )
          .filter(Boolean);
        const sleepCandidate = buildSleepReminderCandidate({
          appState,
          babyId,
          lastSentByKey,
          nowMs,
        });
        return sleepCandidate ? [...careCandidates, sleepCandidate] : careCandidates;
      });
  
      const notificationGroup = groupCandidatesForNotification(candidates, nowMs);
      if (!notificationGroup) continue;
  
      const devices = devicesSnap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((device) => device.subscription?.endpoint && device.subscription?.keys?.auth && device.subscription?.keys?.p256dh);
  
      if (!devices.length) continue;
  
      const payload = buildCareNotificationPayload(notificationGroup, nowMs);
      const sent = await sendPushToDevices(uid, devices, payload);
  
      if (!sent) continue;
  
      const nextLastSentByKey = { ...lastSentByKey };
      for (const candidate of notificationGroup) {
        nextLastSentByKey[candidate.reminderKey] = {
          eventId: candidate.eventId,
          sentAt: admin.firestore.Timestamp.fromMillis(nowMs),
        };
      }
  
      await db
        .collection("users")
        .doc(uid)
        .collection("settings")
        .doc("notifications")
        .set(
          {
            careReminder: {
              enabled: true,
              mergeWindowMinutes,
              diaperGaugeWindowMinutes,
              lastSentByKey: nextLastSentByKey,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    }
    }
  );

  return { sendMilkReminderNotifications };
};
