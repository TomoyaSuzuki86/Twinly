const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const factory = require('../billing-service');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; for (const key of ['TWINLY_BILLING_ENABLED', 'TWINLY_STRIPE_SECRET_KEY', 'TWINLY_STRIPE_PRICE_ID', 'TWINLY_APP_URL']) delete process.env[key]; });
function setup(extra = {}) {
  Object.assign(process.env, { TWINLY_BILLING_ENABLED: 'true', TWINLY_STRIPE_SECRET_KEY: 'test', TWINLY_STRIPE_PRICE_ID: 'price_test', TWINLY_APP_URL: 'https://twinly-prod.web.app' });
  const docs = new Map(Object.entries({ 'users/u': { activeFamilyId: 'f' }, 'families/f/members/u': { status: 'active', role: 'owner' }, 'familyBilling/f': { customerId: 'cus_test' }, ...extra }));
  const ref = path => ({ path, collection: name => ref(`${path}/${name}`), doc: id => ref(`${path}/${id}`), get: async () => ({ data: () => docs.get(path) }), set: async (data) => docs.set(path, { ...docs.get(path), ...data }) });
  const db = { doc: ref, collection: ref, runTransaction: async fn => fn({ get: r => r.get(), set: (r, data) => r.set(data) }) };
  return { services: factory(db), docs };
}
const request = { auth: { uid: 'u' }, data: {} };
const price = { active: true, currency: 'jpy', unit_amount: 200, recurring: { interval: 'month', interval_count: 1 } };
function fetchMock(routes) {
  global.fetch = async (url, options) => {
    const key = url.replace('https://api.stripe.com/v1/', '');
    const body = await routes(key, options);
    return { ok: true, json: async () => body };
  };
}
test('only authenticated active owners can start one trial', async () => {
  const { services, docs } = setup();
  await assert.rejects(services.startFamilyTrial.run({}), e => e.code === 'unauthenticated');
  docs.set('families/f/members/u', { status: 'active', role: 'member' });
  await assert.rejects(services.startFamilyTrial.run(request), e => e.code === 'permission-denied');
  docs.set('families/f/members/u', { status: 'active', role: 'owner' });
  await services.startFamilyTrial.run(request);
  await assert.rejects(services.startFamilyTrial.run(request), e => e.code === 'failed-precondition');
});
test('checkout retry reuses session and rejects mismatched amount', async () => {
  const { services, docs } = setup({ 'families/f/services/access': { trialEndsAt: 1 } });
  let created = 0;
  fetchMock((path, options) => {
    if (path === 'prices/price_test') return price;
    if (path.startsWith('subscriptions?')) return { data: [] };
    if (path === 'checkout/sessions/cs_test') return { status: 'open', url: 'https://checkout.stripe.com/test' };
    if (path === 'checkout/sessions') {
      created++;
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('customer'), 'cus_test');
      assert.equal(body.get('line_items[0][price]'), 'price_test');
      assert.equal(body.get('subscription_data[trial_period_days]'), null);
      return { id: 'cs_test', url: 'https://checkout.stripe.com/test' };
    }
    throw new Error(path);
  });
  await services.createFamilyCheckout.run(request);
  await services.createFamilyCheckout.run(request);
  assert.equal(created, 1);
  assert.equal(docs.get('families/f/services/access').paidUntil, 0);
  fetchMock(() => ({ ...price, unit_amount: 500 }));
  await assert.rejects(services.createFamilyCheckout.run(request), e => e.code === 'failed-precondition');
});
test('existing subscription prevents double contract and only paid invoice grants access', async () => {
  const { services, docs } = setup();
  const sub = { id: 'sub_test', status: 'active', metadata: { familyId: 'f' }, items: { data: [{ price: { id: 'price_test' } }] }, latest_invoice: { paid: false, status: 'open' } };
  fetchMock(path => path === 'prices/price_test' ? price : { data: [sub] });
  await assert.rejects(services.createFamilyCheckout.run(request), e => e.code === 'already-exists');
  assert.equal(docs.get('families/f/services/access').paidUntil, 0);
  sub.latest_invoice = { paid: true, status: 'paid', lines: { data: [{ price: { id: 'price_test' }, period: { end: 9999999999 } }] } };
  await services.refreshFamilyBilling.run(request);
  assert.equal(docs.get('families/f/services/access').paidUntil, 9999999999000);
  sub.status = 'canceled';
  await services.refreshFamilyBilling.run(request);
  assert.equal(docs.get('families/f/services/access').paidUntil, 0);
});
test('provider timeout retries with the same idempotency key', async () => {
  const { services } = setup();
  const keys = [];
  fetchMock((path, options) => {
    if (path === 'prices/price_test') return price;
    if (path.startsWith('subscriptions?')) return { data: [] };
    keys.push(options.headers['Idempotency-Key']);
    throw new Error('timeout');
  });
  await assert.rejects(services.createFamilyCheckout.run(request));
  await assert.rejects(services.createFamilyCheckout.run(request));
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});
