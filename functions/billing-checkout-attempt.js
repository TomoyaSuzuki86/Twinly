const crypto = require('node:crypto');

const CHECKOUT_ATTEMPT_STALE_MS = 23 * 60 * 60 * 1000;

function createCheckoutAttempt(price, now = Date.now(), idFactory = crypto.randomUUID) {
  return { id: idFactory(), createdAt: now, price };
}

function ensureCheckoutAttempt(data, price, now = Date.now(), idFactory = crypto.randomUUID) {
  const current = data?.checkoutAttempt;
  if (current) return { attempt: current, shouldWrite: false };
  return { attempt: createCheckoutAttempt(price, now, idFactory), shouldWrite: true };
}

function rotateCheckoutAttempt(data, previousAttemptId, price, now = Date.now(), idFactory = crypto.randomUUID) {
  const current = data?.checkoutAttempt;
  if (!current || current.id !== previousAttemptId) return { attempt: current || null, shouldWrite: false };
  return { attempt: createCheckoutAttempt(price, now, idFactory), shouldWrite: true };
}

function isUnresolvedCheckoutAttemptStale(attempt, now = Date.now()) {
  return Boolean(attempt && !attempt.sessionId && now - attempt.createdAt > CHECKOUT_ATTEMPT_STALE_MS);
}

module.exports = {
  CHECKOUT_ATTEMPT_STALE_MS,
  ensureCheckoutAttempt,
  isUnresolvedCheckoutAttemptStale,
  rotateCheckoutAttempt,
};
