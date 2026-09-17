const crypto = require('node:crypto');
// Pin the REST contract; no payment details or credentials reach the browser.
async function stripeRequest(secret, path, params, idempotencyKey) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Stripe-Version': '2024-06-20',
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(params ? { body: new URLSearchParams(params).toString() } : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Stripe request failed (${response.status})`);
  return response.json();
}
function verifyStripeEvent(rawBody, signature, secret, now = Date.now()) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !secret) throw new Error('Invalid signature');
  const parts = signature.split(',').map(part => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  if (!/^\d+$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new Error('Expired signature');
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  const valid = parts.filter(([key, value]) => key === 'v1' && /^[a-f0-9]{64}$/.test(value || ''))
    .some(([, value]) => crypto.timingSafeEqual(expected, Buffer.from(value, 'hex')));
  if (!valid) throw new Error('Invalid signature');
  return JSON.parse(rawBody.toString('utf8'));
}
module.exports = { stripeRequest, verifyStripeEvent };
