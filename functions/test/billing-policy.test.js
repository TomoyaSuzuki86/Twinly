const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTrial, billingState } = require('../billing-policy');
const { accessFor } = require('../ai-policy');
const { verifyStripeEvent } = require('../stripe-client');
test('trial lasts exactly seven days and cannot be restarted', () => {
  const trial = startTrial({}, 1000);
  assert.equal(billingState(trial, trial.trialEndsAt - 1).status, 'trialing');
  assert.equal(billingState(trial, trial.trialEndsAt).status, 'expired');
  assert.throws(() => startTrial(trial, trial.trialEndsAt + 1));
});
test('old preview and cached feature grants cannot bypass expired billing', () => {
  const access = accessFor({ billingVersion: 1, trialEndsAt: 1, previewPlan: 'premium', plan: 'premium', features: { familySharing: true } }, true);
  assert.equal(access.plan, 'free');
  assert.equal(access.features.familySharing, false);
});
test('paid entitlement requires an allowed status and unexpired paid period', () => {
  for (const status of ['incomplete', 'unpaid', 'canceled', 'paused']) assert.notEqual(billingState({ subscriptionStatus: status, paidUntil: 2000 }, 1000).status, 'active');
  assert.equal(billingState({ subscriptionStatus: 'active', paidUntil: 2000, cancelAtPeriodEnd: true }, 1000).status, 'active');
  assert.notEqual(billingState({ subscriptionStatus: 'past_due', paidUntil: 1000 }, 1000).status, 'active');
});
test('Stripe signatures reject altered bodies, bad secrets and replayed timestamps', () => {
  const body = Buffer.from('{"type":"invoice.paid"}');
  const signature = crypto.createHmac('sha256', 'secret').update('1000.').update(body).digest('hex');
  assert.equal(verifyStripeEvent(body, `t=1000,v1=${signature}`, 'secret', 1000000).type, 'invoice.paid');
  assert.throws(() => verifyStripeEvent(Buffer.from('{}'), `t=1000,v1=${signature}`, 'secret', 1000000));
  assert.throws(() => verifyStripeEvent(body, `t=1000,v1=${signature}`, 'wrong', 1000000));
  assert.throws(() => verifyStripeEvent(body, `t=1000,v1=${signature}`, 'secret', 1301000));
});
