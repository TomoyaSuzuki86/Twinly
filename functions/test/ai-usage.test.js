const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DAILY_REVIEW_LIMIT,
  DAILY_SUCCESS_LIMIT,
  MIN_SUCCESS_INTERVAL_MS,
  MONTHLY_SUCCESS_LIMIT,
  assertAiUsageAllowed,
} = require('../ai-usage');

const allowed = overrides => ({
  entitled: true,
  feature: 'aiChat',
  daily: {},
  monthly: {},
  now: 100000,
  ...overrides,
});

test('preserves AI daily, monthly, cooldown, and review limits', () => {
  assert.doesNotThrow(() => assertAiUsageAllowed(allowed({})));
  assert.throws(
    () => assertAiUsageAllowed(allowed({ daily: { successfulCount: DAILY_SUCCESS_LIMIT } })),
    error => error.code === 'resource-exhausted'
  );
  assert.throws(
    () => assertAiUsageAllowed(allowed({ monthly: { successfulCount: MONTHLY_SUCCESS_LIMIT } })),
    error => error.code === 'resource-exhausted'
  );
  assert.throws(
    () => assertAiUsageAllowed(allowed({ daily: { lastAt: 100000 - MIN_SUCCESS_INTERVAL_MS + 1 } })),
    error => error.code === 'resource-exhausted'
  );
  assert.throws(
    () => assertAiUsageAllowed(allowed({
      feature: 'aiReview',
      daily: { successfulReviews: DAILY_REVIEW_LIMIT },
    })),
    error => error.code === 'resource-exhausted'
  );
  assert.doesNotThrow(() => assertAiUsageAllowed(allowed({
    feature: 'aiReview',
    daily: { successfulReviews: DAILY_REVIEW_LIMIT },
    allowReviewRefresh: true,
  })));
});

test('entitlement remains a separate precondition from quota', () => {
  assert.throws(
    () => assertAiUsageAllowed(allowed({ entitled: false })),
    error => error.code === 'permission-denied'
  );
});
