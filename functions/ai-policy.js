// Pure policy shared by the callable handlers and their tests. Billing can later
// write plan independently of the private-family preview override.
const FEATURES = Object.fromEntries(['aiReview','aiVoice','themes','gauges','stockForecast','stockNotifications','familySharing','music'].map(key => [key, ['premium']]));
const DAY = 86400000;
const JST = 9 * 3600000;
function accessFor(data = {}, trialAllowed = false) {
  const plan = trialAllowed && ['free', 'premium'].includes(data.previewPlan)
    ? data.previewPlan : data.plan === 'premium' ? 'premium' : 'free';
  return { plan, trialAllowed, features: Object.fromEntries(Object.entries(FEATURES).map(([key, plans]) => [key, plans.includes(plan)])) };
}
function validateDrafts(value, now) {
  if (!Array.isArray(value) || !value.length || value.length > 12) throw new Error('記録は1〜12件で解析してください');
  return value.map(e => {
    if (!e || !['A', 'B'].includes(e.babyId) || !['milk','diaper','solidFood','sleepStart','wake'].includes(e.type)) throw new Error('対象または記録の種類を確認してください');
    if (e.timestamp !== null && (!Number.isFinite(e.timestamp) || e.timestamp < now - 7 * DAY || e.timestamp > now + 60000)) throw new Error('時刻が範囲外です');
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
const jstDayStart = timestamp => Math.floor((timestamp + JST) / DAY) * DAY - JST;
const dateKey = timestamp => new Date(timestamp + JST).toISOString().slice(0, 10);
const overlap = (from, to, rangeFrom, rangeTo) => Math.max(0, Math.min(to, rangeTo) - Math.max(from, rangeFrom));
const isUsefulNote = event => {
  const note = typeof event.note === 'string' ? event.note.trim() : '';
  if (!note) return false;
  if (/^voice:/i.test(note) || /^手動[:：]/.test(note) || /記録により自動起床/.test(note) || /AI音声・文章解析/.test(note)) return false;
  return true;
};
function emptyDay(start) {
  return {
    date: dateKey(start),
    from: start,
    to: start + DAY,
    milkMl: 0,
    milkCount: 0,
    solidFoodCount: 0,
    diaperChanges: 0,
    peeCount: 0,
    poopCount: 0,
    sleepMinutes: 0,
    nightSleepMinutes: 0,
    sleepCount: 0,
    weightKg: null,
    recordCount: 0,
  };
}
function periodFromDays(days, weights) {
  const from = days[0]?.from ?? 0;
  const to = days.at(-1)?.to ?? from;
  return {
    from,
    to,
    milkMl: days.reduce((n,d) => n+d.milkMl,0),
    milkCount: days.reduce((n,d) => n+d.milkCount,0),
    solidFoodCount: days.reduce((n,d) => n+d.solidFoodCount,0),
    diaperChanges: days.reduce((n,d) => n+d.diaperChanges,0),
    peeCount: days.reduce((n,d) => n+d.peeCount,0),
    poopCount: days.reduce((n,d) => n+d.poopCount,0),
    sleepMinutes: Math.round(days.reduce((n,d) => n+d.sleepMinutes,0)),
    nightSleepMinutes: Math.round(days.reduce((n,d) => n+d.nightSleepMinutes,0)),
    sleepCount: days.reduce((n,d) => n+d.sleepCount,0),
    recordCount: days.reduce((n,d) => n+d.recordCount,0),
    daysWithMilkRecords: days.filter(d => d.milkCount > 0).length,
    daysWithAnyRecords: days.filter(d => d.recordCount > 0).length,
    weights: weights.filter(w => w.timestamp >= from && w.timestamp < to),
  };
}
function summarize(events, now, profiles = {}) {
  // Use 14 complete JST days for trend comparison and expose today separately as partial data.
  const todayStart = jstDayStart(now);
  const start = todayStart - 14 * DAY;
  const end = todayStart;
  return ['A','B'].map(babyId => {
    const profile = profiles?.[babyId] || {};
    const name = String(profile.displayName || babyId).trim().slice(0, 40) || babyId;
    const birthDate = typeof profile.birthDate === 'string' ? profile.birthDate.slice(0, 10) : '';
    const bornAt = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? Date.parse(`${birthDate}T00:00:00+09:00`) : NaN;
    const ageDays = Number.isFinite(bornAt) ? Math.max(0, Math.floor((todayStart - bornAt) / DAY)) : null;
    const daily = Array.from({length:14}, (_,i) => emptyDay(start + i * DAY));
    const today = emptyDay(todayStart);
    const dayByKey = new Map(daily.map(d => [d.date,d]));
    dayByKey.set(today.date,today);
    const rows = events.filter(e => e.babyId === babyId && Number.isFinite(e.timestamp) && e.timestamp >= start - DAY && e.timestamp < now + 60000).sort((a,b) => a.timestamp-b.timestamp);
    const weights = [];
    const notes = [];
    for (const event of rows) {
      if (event.timestamp < start || event.timestamp >= now + 60000) continue;
      const day = dayByKey.get(dateKey(event.timestamp));
      if (!day) continue;
      day.recordCount++;
      if (event.type === 'milk' && Number.isFinite(event.milkMl)) { day.milkMl += event.milkMl; day.milkCount++; }
      if (event.type === 'solidFood') day.solidFoodCount++;
      if (event.type === 'diaper') {
        day.diaperChanges++;
        if (event.diaperKind === 'pee' || event.diaperKind === 'mix') day.peeCount++;
        if (event.diaperKind === 'poop' || event.diaperKind === 'mix') day.poopCount++;
      }
      if (event.type === 'weight' && Number.isFinite(event.weight)) {
        const weight = {timestamp:event.timestamp,weight:event.weight};
        day.weightKg = event.weight;
        weights.push(weight);
      }
      if (isUsefulNote(event) && notes.length < 40) notes.push({timestamp:event.timestamp,text:String(event.note).trim().slice(0,160)});
    }
    let sleepStart = null;
    for (const event of rows) {
      if (event.type === 'sleepStart') {
        sleepStart = event.timestamp;
        continue;
      }
      if (event.type !== 'wake' || sleepStart === null || event.timestamp <= sleepStart) continue;
      const intervalStart = sleepStart;
      const intervalEnd = Math.min(event.timestamp, now);
      for (const day of [...daily,today]) {
        const ms = overlap(intervalStart, intervalEnd, day.from, day.to);
        if (!ms) continue;
        day.sleepMinutes += ms / 60000;
        day.nightSleepMinutes += (overlap(intervalStart, intervalEnd, day.from, day.from + 8*3600000) + overlap(intervalStart, intervalEnd, day.from + 20*3600000, day.to)) / 60000;
      }
      const wakeDay = dayByKey.get(dateKey(event.timestamp));
      if (wakeDay) wakeDay.sleepCount++;
      sleepStart = null;
    }
    const milkRows = rows.filter(e => e.type === 'milk' && Number.isFinite(e.milkMl));
    const bedtimeFeeds = rows.filter(e => e.type === 'sleepStart' && e.timestamp >= start && e.timestamp < end).map(sleep => {
      const milk = [...milkRows].reverse().find(e => e.timestamp <= sleep.timestamp && sleep.timestamp - e.timestamp <= 2*3600000);
      return milk ? {sleepStart:sleep.timestamp,milkMl:milk.milkMl,minutesBefore:Math.round((sleep.timestamp-milk.timestamp)/60000)} : null;
    }).filter(Boolean).slice(-20);
    const completeWeights = weights.filter(w => w.timestamp < end).slice(-30);
    return {
      babyId,
      name,
      birthDate,
      ageDays,
      periods: [periodFromDays(daily.slice(0,7),completeWeights),periodFromDays(daily.slice(7),completeWeights)],
      daily: daily.map(d => ({...d,sleepMinutes:Math.round(d.sleepMinutes),nightSleepMinutes:Math.round(d.nightSleepMinutes)})),
      todaySoFar: {...today,sleepMinutes:Math.round(today.sleepMinutes),nightSleepMinutes:Math.round(today.nightSleepMinutes)},
      weights: completeWeights,
      notes: notes.filter(n => n.timestamp < end).slice(-30),
      todayNotes: notes.filter(n => n.timestamp >= end).slice(-10),
      bedtimeFeeds,
    };
  });
}
module.exports = { accessFor, validateDrafts, summarize };
