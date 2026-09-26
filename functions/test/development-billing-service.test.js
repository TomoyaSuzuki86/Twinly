const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const factory = require('../development-billing-service');

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of [
    'TWINLY_DEVELOPMENT_BILLING',
    'TWINLY_STRIPE_TEST_SECRET_KEY',
    'TWINLY_DEVELOPMENT_STRIPE_PRICE_ID',
  ]) delete process.env[key];
});

function setup(extra = {}) {
  Object.assign(process.env, {
    TWINLY_DEVELOPMENT_BILLING: 'true',
    TWINLY_STRIPE_TEST_SECRET_KEY: 'test',
    TWINLY_DEVELOPMENT_STRIPE_PRICE_ID: 'price_test',
  });
  const docs = new Map(Object.entries({
    'users/u': { activeFamilyId: 'f' },
    'families/f': { ownerUid: 'u' },
    'families/f/members/u': { status: 'active', role: 'owner' },
    'developmentFamilyBilling/f': { customerId: 'cus_test' },
    'families/f/services/developmentAccess': { billingVersion: 1, trialEndsAt: 1 },
    ...extra,
  }));
  const ref = path => ({
    path,
    collection: name => ref(`${path}/${name}`),
    doc: id => ref(`${path}/${id}`),
    get: async () => ({ data: () => docs.get(path) }),
    set: async data => docs.set(path, { ...docs.get(path), ...data }),
  });
  const db = {
    doc: ref,
    collection: ref,
    runTransaction: async fn => fn({
      get: target => target.get(),
      set: (target, data) => target.set(data),
    }),
  };
  return { services: factory(db), docs };
}

const request = {
  auth: { uid: 'u' },
  data: {},
  rawRequest: { headers: { origin: 'https://twinly-prod--development.web.app' } },
};
const price = {
  livemode: false,
  active: true,
  currency: 'jpy',
  unit_amount: 200,
  recurring: { interval: 'month', interval_count: 1 },
};

function fetchMock(routes) {
  global.fetch = async (url, options) => {
    const key = url.replace('https://api.stripe.com/v1/', '');
    const body = await routes(key, options);
    return { ok: true, json: async () => body };
  };
}

test('development checkout reuses one session and keeps development metadata', async () => {
  const { services } = setup();
  let created = 0;
  fetchMock((path, options) => {
    if (path === 'prices/price_test') return price;
    if (path.startsWith('subscriptions?')) return { data: [] };
    if (path === 'checkout/sessions/cs_dev') {
      return { status: 'open', url: 'https://checkout.stripe.com/dev' };
    }
    if (path === 'checkout/sessions') {
      created += 1;
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('subscription_data[metadata][familyId]'), 'f');
      assert.equal(body.get('subscription_data[metadata][environment]'), 'development');
      return { id: 'cs_dev', url: 'https://checkout.stripe.com/dev' };
    }
    throw new Error(path);
  });

  const first = await services.developmentCreateFamilyCheckout.run(request);
  const second = await services.developmentCreateFamilyCheckout.run(request);
  assert.equal(first.url, 'https://checkout.stripe.com/dev');
  assert.equal(second.url, 'https://checkout.stripe.com/dev');
  assert.equal(created, 1);
});

test('development reconciliation ignores production-scoped subscriptions', async () => {
  const { services, docs } = setup();
  const productionSubscription = {
    id: 'sub_prod',
    status: 'active',
    created: 10,
    metadata: { familyId: 'f' },
    items: { data: [{ price: { id: 'price_test' } }] },
    latest_invoice: {
      paid: true,
      status: 'paid',
      lines: { data: [{ price: { id: 'price_test' }, period: { end: 9999999999 } }] },
    },
  };
  fetchMock(path => {
    if (path.startsWith('subscriptions?')) return { data: [productionSubscription] };
    throw new Error(path);
  });

  await services.developmentRefreshFamilyBilling.run(request);
  const access = docs.get('families/f/services/developmentAccess');
  assert.equal(access.subscriptionId, null);
  assert.equal(access.paidUntil, 0);
});

test('development reconciliation grants access only from a paid development subscription', async () => {
  const { services, docs } = setup();
  const devSubscription = {
    id: 'sub_dev',
    status: 'active',
    created: 10,
    metadata: { familyId: 'f', environment: 'development' },
    items: { data: [{ price: { id: 'price_test' } }] },
    latest_invoice: {
      paid: true,
      status: 'paid',
      lines: { data: [{ price: { id: 'price_test' }, period: { end: 9999999999 } }] },
    },
  };
  fetchMock(path => {
    if (path.startsWith('subscriptions?')) return { data: [devSubscription] };
    throw new Error(path);
  });

  await services.developmentRefreshFamilyBilling.run(request);
  const access = docs.get('families/f/services/developmentAccess');
  assert.equal(access.subscriptionId, 'sub_dev');
  assert.equal(access.paidUntil, 9999999999000);
});
