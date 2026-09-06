// Pure policy shared by the callable handlers and their tests. Billing can later
// write plan independently of the private-family preview override.
const FEATURES = Object.fromEntries(['aiReview','aiVoice','themes','gauges','stockForecast','stockNotifications','familySharing','music'].map(key => [key, ['premium']]));
function accessFor(data = {}, trialAllowed = false) {
  const plan = trialAllowed && ['free', 'premium'].includes(data.previewPlan)
    ? data.previewPlan : data.plan === 'premium' ? 'premium' : 'free';
  return { plan, trialAllowed, features: Object.fromEntries(Object.entries(FEATURES).map(([key, plans]) => [key, plans.includes(plan)])) };
}
function validateDrafts(value, now) {
  if (!Array.isArray(value) || !value.length || value.length > 12) throw new Error('記録は1〜12件で解析してください');
  return value.map(e => {
    if (!e || !['A', 'B'].includes(e.babyId) || !['milk','diaper','solidFood','sleepStart','wake'].includes(e.type)) throw new Error('対象または記録の種類を確認してください');
    if (e.timestamp !== null && (!Number.isFinite(e.timestamp) || e.timestamp < now - 7 * 86400000 || e.timestamp > now + 60000)) throw new Error('時刻が範囲外です');
    const result = { babyId: e.babyId, type: e.type, timestamp: e.timestamp,
      clarification: typeof e.clarification === 'string' ? e.clarification.slice(0, 200) : '' };
    if (e.type === 'milk') {
      if (!Number.isInteger(e.milkMl) || e.milkMl < 0 || e.milkMl > 1000) throw new Error('ミルク量を確認してください');
      result.milkMl = e.milkMl;
    }
    if (e.type === 'diaper') {
      if (!['pee','poop','mix'].includes(e.diaperKind)) throw new Error('おむつの種類を確認してください');
      result.diaperKind = e.diaperKind;
    }
    return result;
  });
}
function summarize(events, now) {
  // Compare two complete seven-day periods in JST, never today's partial total.
  const end = Math.floor((now + 9 * 3600000) / 86400000) * 86400000 - 9 * 3600000;
  return ['A','B'].map(babyId => ({ babyId, periods: [2,1].map(weeks => {
    const from = end - weeks * 7 * 86400000, to = from + 7 * 86400000;
    const rows = events.filter(e => e.babyId === babyId && e.timestamp >= from && e.timestamp < to);
    const milk = rows.filter(e => e.type === 'milk' && Number.isFinite(e.milkMl));
    return { from, to, milkMl: milk.reduce((n,e) => n+e.milkMl,0), milkCount: milk.length,
      daysWithMilkRecords: new Set(milk.map(e => Math.floor((e.timestamp+9*3600000)/86400000))).size,
      weights: rows.filter(e => e.type === 'weight' && Number.isFinite(e.weight)).map(e => ({timestamp:e.timestamp,weight:e.weight})).slice(-30) };
  }) }));
}
module.exports = { accessFor, validateDrafts, summarize };
