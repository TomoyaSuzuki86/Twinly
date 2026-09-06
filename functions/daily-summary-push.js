const admin = require('firebase-admin');
const webpush = require('web-push');
const { defineSecret } = require('firebase-functions/params');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { accessFor, buildDailySummary } = require('./ai-policy');
const { readApp } = require('./app-storage');

const db = admin.firestore();
const webPushPrivateKey = defineSecret('TWINLY_WEB_PUSH_PRIVATE_KEY');
const publicKey = 'BKEpEJv5umbr7E9b5dptGP0YgCV8EdVo13tDzYxUHrue90qhqIddPtzGjxv5eFuRnQgghz_G_9yOCZQV3QS8SQI';
const subject = 'mailto:no-reply@twinly.local';
const callableOptions = { region: 'asia-northeast1', maxInstances: 1, invoker: 'public' };
const DAY = 86400000;
const JST = 9 * 3600000;
const SETTINGS_ID = 'dailySummaryNotification';
const LEGACY_SETTINGS_ID = 'dailySummaryEmail';

const jstDate = now => new Date(now + JST).toISOString().slice(0, 10);
const jstHour = now => Number(new Date(now + JST).toISOString().slice(11, 13));

const formatDuration = minutes => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}分`;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
};

const buildNotificationPayload = summary => ({
  title: '今日のTwinlyまとめ',
  body: summary.babies.map(baby => {
    const sleeping = baby.isSleeping ? '・睡眠中' : '';
    return `${baby.name}：ミルク${baby.milkMl}ml / 睡眠${formatDuration(baby.sleepMinutes)} / おしっこ${baby.peeCount}・うんち${baby.poopCount}${sleeping}`;
  }).join('\n'),
  tag: `twinly-daily-summary-${summary.date}`,
  url: '/?open=daily-report',
});

async function context(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ログインしてください');
  const uid = request.auth.uid;
  const user = await db.doc(`users/${uid}`).get();
  const familyId = user.data()?.activeFamilyId;
  if (typeof familyId !== 'string' || !familyId || familyId.includes('/')) {
    throw new HttpsError('permission-denied', '家族情報を確認してください');
  }
  const root = db.collection('families').doc(familyId);
  const [member, family, accessSnap] = await Promise.all([
    root.collection('members').doc(uid).get(),
    root.get(),
    root.collection('services').doc('access').get(),
  ]);
  if (member.data()?.status !== 'active') throw new HttpsError('permission-denied', '家族へのアクセス権がありません');
  const isOwner = member.data()?.role === 'owner' || family.data()?.ownerUid === uid;
  return { root, uid, isOwner, access: accessFor(accessSnap.data(), true) };
}

async function readSummarySettings(root) {
  const [current, legacy] = await Promise.all([
    root.collection('services').doc(SETTINGS_ID).get(),
    root.collection('services').doc(LEGACY_SETTINGS_ID).get(),
  ]);
  const source = current.exists ? current.data() : legacy.data() || {};
  return {
    enabled: source.enabled === true,
    hourJst: Number.isInteger(source.hourJst) ? source.hourJst : 21,
    currentExists: current.exists,
  };
}

const getDailySummaryEmailSettings = onCall(callableOptions, async request => {
  const c = await context(request);
  const settings = await readSummarySettings(c.root);
  return {
    enabled: settings.enabled,
    hourJst: settings.hourJst,
    recipients: [],
    canEdit: c.isOwner,
  };
});

const setDailySummaryEmailSettings = onCall(callableOptions, async request => {
  const c = await context(request);
  if (!c.isOwner) throw new HttpsError('permission-denied', '今日のまとめ通知は家族のオーナーが設定してください');
  const enabled = request.data?.enabled === true;
  const hourJst = Number(request.data?.hourJst);
  if (!Number.isInteger(hourJst) || hourJst < 0 || hourJst > 23) {
    throw new HttpsError('invalid-argument', '通知時刻を確認してください');
  }
  if (enabled && !c.access.features.dailySummaryEmail) {
    throw new HttpsError('permission-denied', '今日のまとめ通知はPremium限定です');
  }
  const currentRef = c.root.collection('services').doc(SETTINGS_ID);
  const legacyRef = c.root.collection('services').doc(LEGACY_SETTINGS_ID);
  const batch = db.batch();
  batch.set(currentRef, {
    enabled,
    hourJst,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: c.uid,
  }, { merge: true });
  batch.set(legacyRef, {
    enabled: false,
    migratedToPushAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return { enabled, hourJst, recipients: [], canEdit: true };
});

async function sendPushToUid(uid, payload) {
  const devicesSnap = await db.collection('users').doc(uid).collection('devices')
    .where('notificationsEnabled', '==', true).get();
  const devices = devicesSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(device => device.subscription?.endpoint && device.subscription?.keys?.auth && device.subscription?.keys?.p256dh);
  if (!devices.length) return false;
  const results = await Promise.all(devices.map(async device => {
    try {
      await webpush.sendNotification(device.subscription, JSON.stringify(payload), {
        TTL: 60 * 60,
        urgency: 'normal',
      });
      return true;
    } catch (error) {
      const statusCode = error.statusCode || error.status;
      if (statusCode === 404 || statusCode === 410) {
        await db.collection('users').doc(uid).collection('devices').doc(device.id).delete();
      }
      console.error('Daily summary push failed', { uid, deviceId: device.id, statusCode, message: error.message });
      return false;
    }
  }));
  return results.some(Boolean);
}

async function sendFamilySummary(root, settingsSnap, now) {
  const day = jstDate(now);
  const hour = jstHour(now);
  const data = settingsSnap.data() || {};
  const targetHour = Number(data.hourJst);
  if (!Number.isInteger(targetHour) || hour < targetHour || data.enabled !== true) return;

  const currentRef = root.collection('services').doc(SETTINGS_ID);
  const currentSnap = settingsSnap.id === SETTINGS_ID ? settingsSnap : await currentRef.get();
  if (settingsSnap.id === LEGACY_SETTINGS_ID && currentSnap.exists) return;
  const dedupeData = currentSnap.exists ? currentSnap.data() || {} : data;
  if (dedupeData.lastSentDate === day) return;

  const accessSnap = await root.collection('services').doc('access').get();
  if (!accessFor(accessSnap.data(), true).features.dailySummaryEmail) return;

  const appRef = root.collection('app').doc('state');
  const app = await readApp(appRef);
  if (!app) return;
  const summary = buildDailySummary(app.events || [], now, app.profiles || {});
  const payload = buildNotificationPayload(summary);

  const members = await root.collection('members').where('status', '==', 'active').get();
  let delivered = false;
  for (const member of members.docs.slice(0, 100)) {
    delivered = (await sendPushToUid(member.id, payload)) || delivered;
  }
  if (!delivered) return;

  const batch = db.batch();
  batch.set(currentRef, {
    enabled: true,
    hourJst: targetHour,
    lastSentDate: day,
    lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(settingsSnap.id === LEGACY_SETTINGS_ID ? { migratedFromEmail: true } : {}),
  }, { merge: true });
  if (settingsSnap.id === LEGACY_SETTINGS_ID) {
    batch.set(settingsSnap.ref, {
      enabled: false,
      migratedToPushAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
}

const sendDailySummaryEmails = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Asia/Tokyo',
    region: 'asia-northeast1',
    maxInstances: 1,
    secrets: [webPushPrivateKey],
  },
  async () => {
    webpush.setVapidDetails(subject, publicKey, webPushPrivateKey.value());
    const now = Date.now();
    const settingsRows = await db.collectionGroup('services').where('enabled', '==', true).get();
    for (const settingsSnap of settingsRows.docs) {
      if (![SETTINGS_ID, LEGACY_SETTINGS_ID].includes(settingsSnap.id)) continue;
      const root = settingsSnap.ref.parent.parent;
      if (!root) continue;
      try {
        await sendFamilySummary(root, settingsSnap, now);
      } catch (error) {
        console.error('Daily summary notification failed', { familyId: root.id, message: error?.message });
      }
    }
  }
);

module.exports = {
  getDailySummaryEmailSettings,
  setDailySummaryEmailSettings,
  sendDailySummaryEmails,
};
