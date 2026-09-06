const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { accessFor, buildDailySummary } = require('./ai-policy');

const emailApiKey = defineSecret('TWINLY_EMAIL_API_KEY');
const emailFrom = defineString('TWINLY_EMAIL_FROM', { default: '' });
const region = 'asia-northeast1';
const DAY = 86400000;
const JST = 9 * 3600000;
const RETRY_AFTER_MS = 10 * 60 * 1000;

const db = admin.firestore();
const jstDate = now => new Date(now + JST).toISOString().slice(0, 10);
const jstHour = now => Number(new Date(now + JST).toISOString().slice(11, 13));
const jstDayStart = now => Math.floor((now + JST) / DAY) * DAY - JST;

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const formatDuration = minutes => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}分`;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
};

function formatDailySummaryMail(summary) {
  const rows = summary.babies.map(baby => {
    const sleeping = baby.isSleeping ? '（現在睡眠中）' : '';
    return [
      baby.name,
      `ミルク ${baby.milkCount}回 / ${baby.milkMl}ml`,
      `睡眠 ${formatDuration(baby.sleepMinutes)}${sleeping}`,
      `おしっこ ${baby.peeCount}回 / うんち ${baby.poopCount}回`,
      `離乳食 ${baby.solidFoodCount}回`,
    ];
  });
  const time = new Date(summary.generatedAt).toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit',
  });
  const text = [
    `Twinly 今日のまとめ ${summary.date}`,
    `${time}時点の記録です。`,
    '',
    ...rows.flatMap(row => [...row, '']),
    '今日も一日おつかれさまでした。',
    '',
    '※ Twinlyに記録された内容を集計した日報です。医療上の診断ではありません。',
  ].join('\n');
  const html = [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#202124;line-height:1.65">`,
    `<div style="padding:22px;border-radius:18px;background:#f7f5ff"><div style="font-size:12px;font-weight:700;color:#7257d3">TWINLY DAILY</div><h2 style="margin:6px 0 0;font-size:22px">今日のまとめ</h2><div style="margin-top:4px;color:#666">${escapeHtml(summary.date)} ・ ${escapeHtml(time)}時点</div></div>`,
    rows.map(row => `<div style="margin-top:14px;padding:16px;border:1px solid #e8e8ee;border-radius:14px"><h3 style="margin:0 0 8px;font-size:17px">${escapeHtml(row[0])}</h3>${row.slice(1).map(value => `<div style="margin-top:4px">${escapeHtml(value)}</div>`).join('')}</div>`).join(''),
    `<p style="margin-top:22px;font-weight:600">今日も一日おつかれさまでした。</p>`,
    `<p style="margin-top:18px;color:#777;font-size:12px">※ Twinlyに記録された内容を集計した日報です。医療上の診断ではありません。</p>`,
    `</div>`,
  ].join('');
  return { subject: `Twinly 今日のまとめ ${summary.date}`, text, html };
}

async function loadEvents(root, state, from, to, limit = 1501) {
  const app = state.data()?.app;
  if (state.data()?.schemaVersion === 2) {
    const rows = await root.collection('events')
      .where('timestamp', '>=', from)
      .where('timestamp', '<=', to)
      .orderBy('timestamp')
      .limit(limit)
      .get();
    if (rows.size >= limit) throw new Error('対象期間の記録が多すぎます');
    return rows.docs.map(doc => doc.data());
  }
  return (app?.events || []).filter(event =>
    Number.isFinite(event.timestamp) && event.timestamp >= from && event.timestamp <= to
  );
}

async function familyEmails(root) {
  const members = await root.collection('members').where('status', '==', 'active').get();
  const uids = members.docs.map(doc => doc.id).slice(0, 100);
  if (!uids.length) return [];
  const users = await admin.auth().getUsers(uids.map(uid => ({ uid })));
  return [...new Set(users.users.map(user => String(user.email || '').trim()).filter(Boolean))];
}

async function queueDailySummary(settingsSnap, now) {
  const data = settingsSnap.data() || {};
  const hour = jstHour(now);
  const day = jstDate(now);
  const targetHour = Number(data.hourJst);
  if (settingsSnap.id !== 'dailySummaryEmail' || !Number.isInteger(targetHour)) return false;
  if (hour < targetHour || data.lastQueuedDate === day || data.enabled !== true) return false;

  const root = settingsSnap.ref.parent.parent;
  if (!root) return false;
  const accessSnap = await root.collection('services').doc('access').get();
  if (!accessFor(accessSnap.data(), true).features.dailySummaryEmail) return false;

  const state = await root.collection('app').doc('state').get();
  const app = state.data()?.app;
  if (!app || state.data()?.migrationState === 'copying') return false;

  const recipients = await familyEmails(root);
  if (!recipients.length) return false;
  const events = await loadEvents(root, state, jstDayStart(now) - DAY, now + 60000);
  const summary = buildDailySummary(events, now, app.profiles || {});
  const message = formatDailySummaryMail(summary);
  const mailRef = db.collection('mail').doc();

  return db.runTransaction(async tx => {
    const latest = await tx.get(settingsSnap.ref);
    const latestData = latest.data() || {};
    if (latestData.enabled !== true || latestData.lastQueuedDate === day || Number(latestData.hourJst) > hour) return false;
    tx.create(mailRef, {
      to: recipients,
      message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      familyId: root.id,
      kind: 'dailySummary',
      summaryDate: day,
      idempotencyKey: `twinly-daily-${root.id}-${day}`,
      deliveryStatus: 'queued',
    });
    tx.set(settingsSnap.ref, {
      lastQueuedDate: day,
      lastQueuedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastDeliveryError: admin.firestore.FieldValue.delete(),
    }, { merge: true });
    return true;
  });
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value)) return Number(value);
  return 0;
}

async function claimMail(ref) {
  const now = Date.now();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (data.kind !== 'dailySummary') return null;
    if (data.deliveryStatus === 'sending' && now - timestampMillis(data.deliveryAttemptAt) < RETRY_AFTER_MS) return null;
    tx.set(ref, {
      deliveryStatus: 'sending',
      deliveryAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      deliveryAttempts: admin.firestore.FieldValue.increment(1),
    }, { merge: true });
    return data;
  });
}

async function sendWithResend(data, mailId) {
  const from = String(emailFrom.value() || '').trim();
  const apiKey = String(emailApiKey.value() || '').trim();
  if (!from) throw new Error('TWINLY_EMAIL_FROM が未設定です');
  if (!apiKey) throw new Error('TWINLY_EMAIL_API_KEY が未設定です');

  const recipients = Array.isArray(data.to)
    ? [...new Set(data.to.map(value => String(value || '').trim()).filter(Boolean))]
    : [];
  if (!recipients.length) throw new Error('送信先メールアドレスがありません');
  const message = data.message || {};
  if (!message.subject || !message.html) throw new Error('メール本文が不正です');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': String(data.idempotencyKey || `twinly-mail-${mailId}`).slice(0, 256),
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      from,
      to: recipients,
      subject: String(message.subject),
      html: String(message.html),
      ...(message.text ? { text: String(message.text) } : {}),
      tags: [{ name: 'kind', value: 'daily_summary' }],
    }),
  });

  if (!response.ok) {
    let details = '';
    try { details = (await response.text()).slice(0, 500); } catch {}
    throw new Error(`Resend ${response.status}${details ? `: ${details}` : ''}`);
  }
  const result = await response.json();
  return String(result.id || 'sent');
}

async function recordFamilyDelivery(data, fields) {
  const familyId = String(data.familyId || '').trim();
  if (!familyId || familyId.includes('/')) return;
  await db.collection('families').doc(familyId).collection('services').doc('dailySummaryEmail').set(fields, { merge: true });
}

async function deliverMailSnapshot(snapshot) {
  if (!snapshot?.exists) return false;
  const claimed = await claimMail(snapshot.ref);
  if (!claimed) return false;
  try {
    const providerId = await sendWithResend(claimed, snapshot.id);
    await recordFamilyDelivery(claimed, {
      lastSentDate: claimed.summaryDate || null,
      lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
      lastProviderMessageId: providerId,
      lastDeliveryError: admin.firestore.FieldValue.delete(),
    });
    await snapshot.ref.delete();
    console.log('Daily summary email sent', { familyId: claimed.familyId, providerId });
    return true;
  } catch (error) {
    const message = String(error?.message || 'メール配送に失敗しました').slice(0, 800);
    await snapshot.ref.set({
      deliveryStatus: 'failed',
      deliveryError: message,
      deliveryFailedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await recordFamilyDelivery(claimed, {
      lastDeliveryError: message,
      lastDeliveryAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.error('Daily summary email delivery failed', { familyId: claimed.familyId, message });
    return false;
  }
}

const ensureDailySummaryEmailQueue = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Asia/Tokyo', region, maxInstances: 1 },
  async () => {
    const now = Date.now();
    const rows = await db.collectionGroup('services').where('enabled', '==', true).get();
    for (const settingsSnap of rows.docs) {
      try {
        await queueDailySummary(settingsSnap, now);
      } catch (error) {
        const root = settingsSnap.ref.parent.parent;
        console.error('Daily summary catch-up queue failed', { familyId: root?.id, message: error?.message });
      }
    }
  }
);

const deliverQueuedDailySummaryEmail = onDocumentCreated(
  { document: 'mail/{mailId}', region, maxInstances: 5, secrets: [emailApiKey] },
  async event => {
    await deliverMailSnapshot(event.data);
  }
);

const flushQueuedDailySummaryEmails = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Asia/Tokyo', region, maxInstances: 1, secrets: [emailApiKey] },
  async () => {
    const rows = await db.collection('mail').where('kind', '==', 'dailySummary').limit(50).get();
    for (const snap of rows.docs) await deliverMailSnapshot(snap);
  }
);

const getDailySummaryDeliveryStatus = onCall({ region, invoker: 'public' }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ログインしてください');
  const user = await db.collection('users').doc(request.auth.uid).get();
  const familyId = user.data()?.activeFamilyId;
  if (typeof familyId !== 'string' || !familyId || familyId.includes('/')) throw new HttpsError('permission-denied', '家族情報を確認してください');
  const root = db.collection('families').doc(familyId);
  const member = await root.collection('members').doc(request.auth.uid).get();
  if (member.data()?.status !== 'active') throw new HttpsError('permission-denied', '家族へのアクセス権がありません');
  const settings = await root.collection('services').doc('dailySummaryEmail').get();
  const data = settings.data() || {};
  return {
    lastSentDate: typeof data.lastSentDate === 'string' ? data.lastSentDate : null,
    lastSentAt: timestampMillis(data.lastSentAt) || null,
    lastDeliveryAttemptAt: timestampMillis(data.lastDeliveryAttemptAt) || null,
    lastDeliveryError: typeof data.lastDeliveryError === 'string' ? data.lastDeliveryError : '',
  };
});

module.exports = {
  ensureDailySummaryEmailQueue,
  deliverQueuedDailySummaryEmail,
  flushQueuedDailySummaryEmails,
  getDailySummaryDeliveryStatus,
};
