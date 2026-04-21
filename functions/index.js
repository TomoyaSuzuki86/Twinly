const admin = require("firebase-admin");
const webpush = require("web-push");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger, setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "asia-northeast1", maxInstances: 1 });

const db = admin.firestore();
const intervalMinutes = 150;
const mergeWindowMinutes = 15;
const mergeWindowMs = mergeWindowMinutes * 60 * 1000;

const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
const subject = process.env.WEB_PUSH_SUBJECT || "mailto:no-reply@twinly.local";
const tokyoTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

const formatReminderTime = (timestamp) => tokyoTimeFormatter.format(new Date(timestamp));

const buildLatestMilkCandidate = ({ appState, babyId, lastSentByBaby, nowMs }) => {
  const events = Array.isArray(appState?.events) ? appState.events : [];
  const profiles = appState?.profiles ?? {};
  const latestMilkEvent = events
    .filter((event) => event.babyId === babyId && event.type === "milk")
    .sort((left, right) => right.timestamp - left.timestamp)[0];

  if (!latestMilkEvent) return null;

  const lastSent = lastSentByBaby?.[babyId];
  if (lastSent?.eventId === latestMilkEvent.id) return null;

  const dueAt = latestMilkEvent.timestamp + intervalMinutes * 60 * 1000;

  return {
    babyId,
    displayName: profiles[babyId]?.displayName ?? `赤ちゃん${babyId}`,
    eventId: latestMilkEvent.id,
    milkAt: latestMilkEvent.timestamp,
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
  const grouped = candidates
    .filter((candidate) => candidate)
    .filter((candidate) => candidate.dueAt - primary.dueAt <= mergeWindowMs && candidate.dueAt >= primary.dueAt);

  return grouped.length ? grouped : [primary];
};

const buildNotificationPayload = (group) => {
  if (group.length === 1) {
    const candidate = group[0];
    const time = formatReminderTime(candidate.milkAt);

    return {
      title: `${candidate.displayName}のミルク確認タイミングです`,
      body: `前回は ${time} です`,
      tag: `milk-reminder-${candidate.babyId}-${candidate.eventId}`,
      url: "/",
    };
  }

  const body = group
    .map((candidate) => {
      const time = formatReminderTime(candidate.milkAt);
      return `${candidate.displayName}: 前回 ${time}`;
    })
    .join("\n");

  return {
    title: "ミルクの確認タイミングです",
    body,
    tag: `milk-reminder-${group.map((candidate) => candidate.babyId).join("-")}`,
    url: "/",
  };
};

const sendPushToDevices = async (uid, devices, payload) => {
  const tasks = devices.map(async (device) => {
    try {
      await webpush.sendNotification(device.subscription, JSON.stringify(payload));
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

exports.sendMilkReminderNotifications = onSchedule("every 5 minutes", async () => {
  if (!publicKey || !privateKey) {
    logger.error("WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY are not configured.");
    return;
  }

  const nowMs = Date.now();
  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const uid = userDoc.id;
    const [appSnap, settingsSnap, devicesSnap] = await Promise.all([
      db.collection("users").doc(uid).collection("app").doc("state").get(),
      db.collection("users").doc(uid).collection("settings").doc("notifications").get(),
      db.collection("users").doc(uid).collection("devices").where("notificationsEnabled", "==", true).get(),
    ]);

    if (!appSnap.exists || devicesSnap.empty) continue;

    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    const milkReminder = settings?.milkReminder ?? {};
    if (milkReminder.enabled === false) continue;

    const appState = appSnap.data()?.app;
    if (!appState) continue;

    const lastSentByBaby = milkReminder.lastSentByBaby ?? {};
    const candidates = ["A", "B"]
      .map((babyId) => buildLatestMilkCandidate({ appState, babyId, lastSentByBaby, nowMs }))
      .filter(Boolean);

    const notificationGroup = groupCandidatesForNotification(candidates, nowMs);
    if (!notificationGroup) continue;

    const devices = devicesSnap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((device) => device.subscription?.endpoint && device.subscription?.keys?.auth && device.subscription?.keys?.p256dh);

    if (!devices.length) continue;

    const payload = buildNotificationPayload(notificationGroup);
    const sent = await sendPushToDevices(uid, devices, payload);

    if (!sent) continue;

    const nextLastSentByBaby = { ...lastSentByBaby };
    for (const candidate of notificationGroup) {
      nextLastSentByBaby[candidate.babyId] = {
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
          milkReminder: {
            enabled: true,
            intervalMinutes,
            mergeWindowMinutes,
            lastSentByBaby: nextLastSentByBaby,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }
});
