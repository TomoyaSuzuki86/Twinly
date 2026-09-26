const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { accessFor } = require('./ai-policy');
const { billingState, startTrial, PRICE_YEN } = require('./billing-policy');
const { buildBillingAccessPatch, selectBillingSubscription } = require('./billing-reconciliation');
const { ensureCheckoutAttempt, isUnresolvedCheckoutAttemptStale, rotateCheckoutAttempt } = require('./billing-checkout-attempt');
const { expireDevelopmentTrial } = require('./development-billing-policy');
const { stripeRequest } = require('./stripe-client');

const secret = defineSecret('TWINLY_STRIPE_TEST_SECRET_KEY');
const options = { region: 'asia-northeast1', maxInstances: 1, invoker: 'public', secrets: [secret] };
const enabled = () => process.env.TWINLY_DEVELOPMENT_BILLING === 'true';

module.exports = function createDevelopmentBillingServices(db) {
  const api = (path, params, key) => stripeRequest(secret.value(), path, params, key);

  async function context(request, ownerOnly = false) {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインしてください');
    if (!enabled()) throw new HttpsError('failed-precondition', 'development決済は無効です');
    const uid = request.auth.uid;
    const user = await db.doc(`users/${uid}`).get();
    const familyId = user.data()?.activeFamilyId;
    if (typeof familyId !== 'string' || !familyId || familyId.includes('/')) throw new HttpsError('permission-denied', '家族情報を確認してください');
    const root = db.collection('families').doc(familyId);
    const [member, family] = await Promise.all([root.collection('members').doc(uid).get(), root.get()]);
    if (member.data()?.status !== 'active') throw new HttpsError('permission-denied', '家族へのアクセス権がありません');
    const canManage = member.data()?.role === 'owner' || family.data()?.ownerUid === uid;
    if (ownerOnly && !canManage) throw new HttpsError('permission-denied', '家族の管理者が操作してください');
    return {
      familyId,
      canManage,
      ref: root.collection('services').doc('developmentAccess'),
      privateRef: db.collection('developmentFamilyBilling').doc(familyId),
    };
  }

  function priceId() {
    const price = process.env.TWINLY_DEVELOPMENT_STRIPE_PRICE_ID;
    if (!/^price_[A-Za-z0-9]+$/.test(price || '')) throw new HttpsError('failed-precondition', 'development価格IDを確認してください');
    return price;
  }

  function originFromRequest(request) {
    const raw = String(request.rawRequest?.headers?.origin || '');
    let url;
    try { url = new URL(raw); } catch { throw new HttpsError('failed-precondition', 'development画面のURLを確認できません'); }
    const preview = /^twinly-prod--development(?:-[a-z0-9-]+)?\.web\.app$/i.test(url.hostname);
    if (url.protocol !== 'https:' || !preview) throw new HttpsError('failed-precondition', 'developmentプレビューから操作してください');
    return url.origin;
  }

  async function sync(ctx) {
    return db.runTransaction(async tx => {
      const [privateSnap, accessSnap] = await Promise.all([tx.get(ctx.privateRef), tx.get(ctx.ref)]);
      const customerId = privateSnap.data()?.customerId;
      if (!customerId) return;
      const price = priceId();
      const subscriptions = await api(`subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100&expand[]=data.latest_invoice`);
      if (subscriptions.has_more) throw new Error('Too many development subscriptions');
      const sub = selectBillingSubscription({
        subscriptions: subscriptions.data,
        familyId: ctx.familyId,
        priceId: price,
        environment: 'development',
        multipleMessage: 'Multiple development subscriptions',
      });
      tx.set(ctx.ref, buildBillingAccessPatch({
        existing: accessSnap.data() || {},
        subscription: sub,
        priceId: price,
      }), { merge: true });
    });
  }

  const developmentGetFamilyAccess = onCall({ ...options, secrets: [] }, async request => {
    const ctx = await context(request);
    const snap = await ctx.ref.get();
    return { ...accessFor({ ...(snap.data() || {}), billingVersion: 1 }, true), canPreview: ctx.canManage };
  });

  const developmentStartFamilyTrial = onCall({ ...options, secrets: [] }, async request => {
    const ctx = await context(request, true);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ctx.ref);
      try { tx.set(ctx.ref, startTrial({ ...(snap.data() || {}), billingVersion: 1 }), { merge: true }); }
      catch (error) { throw new HttpsError('failed-precondition', error.message); }
    });
    return { ok: true };
  });

  const developmentExpireFamilyTrial = onCall({ ...options, secrets: [] }, async request => {
    const ctx = await context(request, true);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ctx.ref);
      try { tx.set(ctx.ref, expireDevelopmentTrial(snap.data()), { merge: true }); }
      catch (error) { throw new HttpsError('failed-precondition', error.message); }
    });
    return { ok: true };
  });

  const developmentCreateFamilyCheckout = onCall(options, async request => {
    const ctx = await context(request, true);
    const price = priceId();
    const origin = originFromRequest(request);
    const priceData = await api(`prices/${price}`);
    if (priceData.livemode !== false || !priceData.active || priceData.currency !== 'jpy' || priceData.unit_amount !== PRICE_YEN || priceData.recurring?.interval !== 'month' || priceData.recurring?.interval_count !== 1) {
      throw new HttpsError('failed-precondition', 'developmentの月額料金設定が一致していません');
    }
    let privateData = (await ctx.privateRef.get()).data() || {};
    if (!privateData.customerId) {
      const customer = await api('customers', {
        'metadata[familyId]': ctx.familyId,
        'metadata[environment]': 'development',
      }, `twinly-dev-customer-${ctx.familyId}`);
      await db.runTransaction(async tx => {
        const existing = await tx.get(ctx.privateRef);
        if (!existing.data()?.customerId) tx.set(ctx.privateRef, { customerId: customer.id }, { merge: true });
      });
      privateData = (await ctx.privateRef.get()).data() || {};
    }
    await sync(ctx);
    const accessData = (await ctx.ref.get()).data() || {};
    const state = billingState(accessData);
    if (state.hasSubscription) throw new HttpsError('already-exists', 'development契約があります。「契約・支払いを管理」から確認してください');
    if (state.status === 'trialing') throw new HttpsError('failed-precondition', '無料体験の終了後にテスト決済してください');
    let attempt = await db.runTransaction(async tx => {
      const snap = await tx.get(ctx.privateRef);
      const decision = ensureCheckoutAttempt(snap.data(), price);
      if (decision.shouldWrite) tx.set(ctx.privateRef, { checkoutAttempt: decision.attempt }, { merge: true });
      return decision.attempt;
    });
    if (attempt.sessionId) {
      const session = await api(`checkout/sessions/${attempt.sessionId}`);
      if (session.status === 'open') return { url: session.url };
      if (session.status === 'complete' && !(session.subscription === accessData.subscriptionId && ['canceled', 'incomplete_expired'].includes(accessData.subscriptionStatus))) {
        throw new HttpsError('failed-precondition', 'テスト支払いを確認中です。少し待ってから再度確認してください');
      }
      attempt = await db.runTransaction(async tx => {
        const snap = await tx.get(ctx.privateRef);
        const decision = rotateCheckoutAttempt(snap.data(), attempt.id, price);
        if (decision.shouldWrite) tx.set(ctx.privateRef, { checkoutAttempt: decision.attempt }, { merge: true });
        return decision.attempt;
      });
    }
    if (!attempt || isUnresolvedCheckoutAttemptStale(attempt)) throw new HttpsError('failed-precondition', '前回のテスト決済状況を確認してください');
    const session = await api('checkout/sessions', {
      mode: 'subscription',
      customer: privateData.customerId,
      locale: 'ja',
      'payment_method_types[0]': 'card',
      'line_items[0][price]': attempt.price,
      'line_items[0][quantity]': '1',
      client_reference_id: ctx.familyId,
      'subscription_data[metadata][familyId]': ctx.familyId,
      'subscription_data[metadata][environment]': 'development',
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancel`,
    }, `twinly-dev-checkout-${attempt.id}`);
    await ctx.privateRef.set({ checkoutAttempt: { ...attempt, sessionId: session.id } }, { merge: true });
    return { url: session.url };
  });

  const developmentCreateFamilyBillingPortal = onCall(options, async request => {
    const ctx = await context(request, true);
    const customerId = (await ctx.privateRef.get()).data()?.customerId;
    if (!customerId) throw new HttpsError('failed-precondition', 'development契約がありません');
    const session = await api('billing_portal/sessions', {
      customer: customerId,
      return_url: `${originFromRequest(request)}/?billing=return`,
      locale: 'ja',
    });
    return { url: session.url };
  });

  const developmentRefreshFamilyBilling = onCall(options, async request => {
    const ctx = await context(request, true);
    await sync(ctx);
    return { ok: true };
  });

  return {
    developmentGetFamilyAccess,
    developmentStartFamilyTrial,
    developmentExpireFamilyTrial,
    developmentCreateFamilyCheckout,
    developmentCreateFamilyBillingPortal,
    developmentRefreshFamilyBilling,
  };
};
