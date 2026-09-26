const CURRENT_SUBSCRIPTION_EXCLUDED_STATUSES = new Set(['canceled', 'incomplete_expired']);
const ACCESS_REVOKED_STATUSES = new Set(['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']);

function selectBillingSubscription({
  subscriptions,
  familyId,
  priceId,
  environment,
  multipleMessage,
}) {
  const relevant = subscriptions.filter(sub =>
    sub.metadata?.familyId === familyId &&
    (environment === undefined || sub.metadata?.environment === environment) &&
    sub.items?.data?.some(item => item.price?.id === priceId)
  );
  const current = relevant.filter(sub => !CURRENT_SUBSCRIPTION_EXCLUDED_STATUSES.has(sub.status));
  if (current.length > 1) throw new Error(multipleMessage);
  return current[0] || [...relevant].sort((a, b) => b.created - a.created)[0] || null;
}

function buildBillingAccessPatch({ existing = {}, subscription, priceId, now = Date.now() }) {
  let paidUntil = existing.paidUntil || 0;
  if (!subscription || existing.subscriptionId !== subscription.id) paidUntil = 0;

  const invoice = subscription?.latest_invoice;
  if (invoice && typeof invoice === 'object' && invoice.paid && invoice.status === 'paid') {
    const periods = invoice.lines?.data
      ?.filter(line => line.price?.id === priceId)
      .map(line => line.period?.end * 1000)
      .filter(Number.isFinite) || [];
    paidUntil = Math.max(paidUntil, 0, ...periods);
  }

  if (!subscription || ACCESS_REVOKED_STATUSES.has(subscription.status)) paidUntil = 0;

  return {
    billingVersion: 1,
    subscriptionId: subscription?.id || null,
    subscriptionStatus: subscription?.status || null,
    paidUntil,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end === true,
    billingUpdatedAt: now,
  };
}

module.exports = {
  buildBillingAccessPatch,
  selectBillingSubscription,
};
