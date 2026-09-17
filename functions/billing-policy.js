const TRIAL_MS = 7 * 86400000;
const PRICE_YEN = 200;
function billingState(data = {}, now = Date.now()) {
  const complimentary = data.premiumGrant === 'legacy';
  const trialEndsAt = Number.isFinite(data.trialEndsAt) ? data.trialEndsAt : null;
  const paidUntil = Number.isFinite(data.paidUntil) ? data.paidUntil : 0;
  const paid = paidUntil > now && ['active', 'past_due'].includes(data.subscriptionStatus);
  const trial = !paid && trialEndsAt !== null && trialEndsAt > now;
  return {
    complimentary,
    status: complimentary || paid ? 'active' : trial ? 'trialing' : trialEndsAt !== null ? 'expired' : 'not_started',
    trialEndsAt, paidUntil, priceYen: PRICE_YEN,
    canStartTrial: !complimentary && trialEndsAt === null && !data.subscriptionId,
    hasSubscription: Boolean(data.subscriptionId && !['canceled', 'incomplete_expired'].includes(data.subscriptionStatus)),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
  };
}
function startTrial(data = {}, now = Date.now()) {
  if (!billingState(data, now).canStartTrial) throw new Error('無料体験は1家族につき1回です');
  return { billingVersion: 1, trialStartedAt: now, trialEndsAt: now + TRIAL_MS };
}
module.exports = { billingState, startTrial, PRICE_YEN };
