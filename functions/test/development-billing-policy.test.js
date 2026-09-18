const test = require('node:test');
const assert = require('node:assert/strict');
const { expireDevelopmentTrial } = require('../development-billing-policy');
const { billingState } = require('../billing-policy');

test('development trial can be fast-forwarded to expired without touching start time', () => {
  const now = 2_000_000_000_000;
  const data = {
    billingVersion: 1,
    trialStartedAt: now - 60_000,
    trialEndsAt: now + 7 * 86400000,
  };
  const next = { ...data, ...expireDevelopmentTrial(data, now) };
  assert.equal(next.trialStartedAt, data.trialStartedAt);
  assert.equal(next.trialEndsAt, now - 1);
  assert.equal(next.developmentExpiredAt, now);
  assert.equal(billingState(next, now).status, 'expired');
});

test('development fast-forward is rejected before trial start and after expiration', () => {
  const now = 2_000_000_000_000;
  assert.throws(() => expireDevelopmentTrial({}, now), /無料体験中/);
  assert.throws(() => expireDevelopmentTrial({ billingVersion: 1, trialEndsAt: now - 1 }, now), /無料体験中/);
});
