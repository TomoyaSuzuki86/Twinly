const { HttpsError } = require('firebase-functions/v2/https');

const DAILY_SUCCESS_LIMIT = 40;
const MONTHLY_SUCCESS_LIMIT = 600;
const DAILY_REVIEW_LIMIT = 2;
const MIN_SUCCESS_INTERVAL_MS = 5000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const jstDate = now => new Date(now + JST_OFFSET_MS).toISOString().slice(0, 10);

function assertAiUsageAllowed({
  entitled,
  feature,
  daily = {},
  monthly = {},
  now,
  allowReviewRefresh = false,
}) {
  if (!entitled) {
    throw new HttpsError('permission-denied', '無料モードではAI機能を利用できません');
  }
  const reviewLimitReached =
    feature === 'aiReview' &&
    (daily.successfulReviews || 0) >= DAILY_REVIEW_LIMIT &&
    !allowReviewRefresh;
  const limited =
    (daily.successfulCount || 0) >= DAILY_SUCCESS_LIMIT ||
    (monthly.successfulCount || 0) >= MONTHLY_SUCCESS_LIMIT ||
    now - (daily.lastAt || 0) < MIN_SUCCESS_INTERVAL_MS ||
    reviewLimitReached;
  if (limited) {
    throw new HttpsError('resource-exhausted', 'AI利用上限に達しました。通常の記録は引き続き使えます');
  }
}

function createAiUsage({ db, accessFor }) {
  async function reserve(ctx, feature, reserveOptions = {}) {
    const now = Date.now();
    const day = jstDate(now);
    const month = day.slice(0, 7);
    const daily = ctx.root.collection('aiUsage').doc(day);
    const monthly = ctx.root.collection('aiUsage').doc(month);
    await db.runTransaction(async tx => {
      const [accessSnapshot, dailySnapshot, monthlySnapshot] = await Promise.all([
        tx.get(ctx.ref),
        tx.get(daily),
        tx.get(monthly),
      ]);
      const dailyData = dailySnapshot.data() || {};
      const monthlyData = monthlySnapshot.data() || {};
      assertAiUsageAllowed({
        entitled: Boolean(accessFor(accessSnapshot.data(), ctx.access.trialAllowed).features[feature]),
        feature,
        daily: dailyData,
        monthly: monthlyData,
        now,
        allowReviewRefresh: Boolean(reserveOptions.allowReviewRefresh),
      });
      tx.set(daily, { ...dailyData, lastAt: now });
    });
    return { day, month, feature };
  }

  async function commit(ctx, reservation) {
    const daily = ctx.root.collection('aiUsage').doc(reservation.day);
    const monthly = ctx.root.collection('aiUsage').doc(reservation.month);
    await db.runTransaction(async tx => {
      const [dailySnapshot, monthlySnapshot] = await Promise.all([
        tx.get(daily),
        tx.get(monthly),
      ]);
      const dailyData = dailySnapshot.data() || {};
      const monthlyData = monthlySnapshot.data() || {};
      tx.set(daily, {
        ...dailyData,
        successfulCount: (dailyData.successfulCount || 0) + 1,
        successfulReviews:
          (dailyData.successfulReviews || 0) + (reservation.feature === 'aiReview' ? 1 : 0),
      });
      tx.set(monthly, {
        ...monthlyData,
        successfulCount: (monthlyData.successfulCount || 0) + 1,
      });
    });
  }

  return { reserve, commit };
}

module.exports = {
  DAILY_REVIEW_LIMIT,
  DAILY_SUCCESS_LIMIT,
  MIN_SUCCESS_INTERVAL_MS,
  MONTHLY_SUCCESS_LIMIT,
  assertAiUsageAllowed,
  createAiUsage,
};
