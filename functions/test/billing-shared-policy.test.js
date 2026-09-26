const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildBillingAccessPatch, selectBillingSubscription } = require('../billing-reconciliation');
const {
  CHECKOUT_ATTEMPT_STALE_MS,
  ensureCheckoutAttempt,
  isUnresolvedCheckoutAttemptStale,
  rotateCheckoutAttempt,
} = require('../billing-checkout-attempt');

const priceId = 'price_test';
const subscription = (overrides = {}) => ({
  id: 'sub_1',
  status: 'active',
  created: 10,
  metadata: { familyId: 'f' },
  items: { data: [{ price: { id: priceId } }] },
  latest_invoice: { paid: false, status: 'open' },
  ...overrides,
});

test('selects the matching family and price and supports environment isolation', () => {
  const prod = subscription();
  const dev = subscription({ id: 'sub_dev', metadata: { familyId: 'f', environment: 'development' } });
  assert.equal(selectBillingSubscription({
    subscriptions: [prod],
    familyId: 'f',
    priceId,
    environment: undefined,
    multipleMessage: 'multiple',
  }).id, 'sub_1');
  assert.equal(selectBillingSubscription({
    subscriptions: [prod, dev],
    familyId: 'f',
    priceId,
    environment: 'development',
    multipleMessage: 'multiple',
  }).id, 'sub_dev');
});

test('rejects multiple current subscriptions in one billing scope', () => {
  assert.throws(() => selectBillingSubscription({
    subscriptions: [subscription(), subscription({ id: 'sub_2', created: 11 })],
    familyId: 'f',
    priceId,
    environment: undefined,
    multipleMessage: 'multiple',
  }), /multiple/);
});

test('paid invoice extends access and revoked statuses clear it', () => {
  const paid = subscription({
    latest_invoice: {
      paid: true,
      status: 'paid',
      lines: { data: [{ price: { id: priceId }, period: { end: 1234 } }] },
    },
  });
  assert.equal(buildBillingAccessPatch({
    existing: { subscriptionId: paid.id, paidUntil: 1000 },
    subscription: paid,
    priceId,
    now: 99,
  }).paidUntil, 1234000);
  assert.equal(buildBillingAccessPatch({
    existing: { subscriptionId: paid.id, paidUntil: 1234000 },
    subscription: { ...paid, status: 'canceled' },
    priceId,
    now: 100,
  }).paidUntil, 0);
});

test('checkout attempt policy preserves retry identity and rotates only the observed attempt', () => {
  const first = ensureCheckoutAttempt({}, priceId, 100, () => 'attempt-1');
  assert.deepEqual(first, { attempt: { id: 'attempt-1', createdAt: 100, price: priceId }, shouldWrite: true });
  assert.equal(ensureCheckoutAttempt({ checkoutAttempt: first.attempt }, priceId, 200, () => 'unused').attempt.id, 'attempt-1');

  const staleWriter = rotateCheckoutAttempt({ checkoutAttempt: { ...first.attempt, id: 'attempt-newer' } }, 'attempt-1', priceId, 300, () => 'attempt-2');
  assert.equal(staleWriter.shouldWrite, false);
  assert.equal(staleWriter.attempt.id, 'attempt-newer');

  const rotated = rotateCheckoutAttempt({ checkoutAttempt: first.attempt }, 'attempt-1', priceId, 300, () => 'attempt-2');
  assert.deepEqual(rotated, { attempt: { id: 'attempt-2', createdAt: 300, price: priceId }, shouldWrite: true });
});

test('unresolved checkout becomes stale only after the existing 23 hour contract', () => {
  const attempt = { id: 'a', createdAt: 100, price: priceId };
  assert.equal(isUnresolvedCheckoutAttemptStale(attempt, 100 + CHECKOUT_ATTEMPT_STALE_MS), false);
  assert.equal(isUnresolvedCheckoutAttemptStale(attempt, 101 + CHECKOUT_ATTEMPT_STALE_MS), true);
  assert.equal(isUnresolvedCheckoutAttemptStale({ ...attempt, sessionId: 'cs_1' }, 101 + CHECKOUT_ATTEMPT_STALE_MS), false);
});
