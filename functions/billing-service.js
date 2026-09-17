const crypto = require('node:crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { billingState, startTrial, PRICE_YEN } = require('./billing-policy');
const { stripeRequest, verifyStripeEvent } = require('./stripe-client');
const secret = defineSecret('TWINLY_STRIPE_SECRET_KEY');
const webhookSecret = defineSecret('TWINLY_STRIPE_WEBHOOK_SECRET');
const options = { region: 'asia-northeast1', maxInstances: 1, invoker: 'public', secrets: [secret] };
const enabled = () => process.env.TWINLY_BILLING_ENABLED === 'true';

module.exports = function createBillingServices(db) {
  const api = (path, params, key) => stripeRequest(secret.value(), path, params, key);
  async function ownerContext(request) {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインしてください');
    if (!enabled()) throw new HttpsError('failed-precondition', '決済の準備中です');
    const uid = request.auth.uid;
    const user = await db.doc(`users/${uid}`).get();
    const familyId = user.data()?.activeFamilyId;
    if (typeof familyId !== 'string' || !familyId || familyId.includes('/')) throw new HttpsError('permission-denied', '家族情報を確認してください');
    const root = db.collection('families').doc(familyId);
    const member = await root.collection('members').doc(uid).get();
    if (member.data()?.status !== 'active' || member.data()?.role !== 'owner') throw new HttpsError('permission-denied', '家族の管理者が操作してください');
    return { familyId, ref: root.collection('services').doc('access'), privateRef: db.collection('familyBilling').doc(familyId) };
  }
  function config() {
    const price = process.env.TWINLY_STRIPE_PRICE_ID;
    const origin = process.env.TWINLY_APP_URL;
    if (!/^price_[a-zA-Z0-9]+$/.test(price || '') || !origin || new URL(origin).protocol !== 'https:') throw new HttpsError('failed-precondition', '決済設定を確認してください');
    return { price, origin: new URL(origin).origin };
  }
  // Read the current Stripe state rather than trusting event delivery order.
  // Firestore retries this read-only reconciliation if another update wins.
  async function sync(ctx) {
    return db.runTransaction(async tx => {
      const [privateSnap, accessSnap] = await Promise.all([tx.get(ctx.privateRef), tx.get(ctx.ref)]);
      const customerId = privateSnap.data()?.customerId;
      if (!customerId) return;
      const price = config().price;
      const subscriptions = await api(`subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100&expand[]=data.latest_invoice`);
      if (subscriptions.has_more) throw new Error('Too many subscriptions; reconciliation required');
      const relevant = subscriptions.data.filter(sub => sub.metadata?.familyId === ctx.familyId && sub.items?.data?.some(item => item.price?.id === price));
      const current = relevant.filter(sub => !['canceled', 'incomplete_expired'].includes(sub.status));
      if (current.length > 1) throw new Error('Multiple subscriptions; reconciliation required');
      const sub = current[0] || relevant.sort((a, b) => b.created - a.created)[0];
      const existing = accessSnap.data() || {};
      let paidUntil = existing.paidUntil || 0;
      if (!sub || existing.subscriptionId !== sub.id) paidUntil = 0;
      const invoice = sub?.latest_invoice;
      if (invoice && typeof invoice === 'object' && invoice.paid && invoice.status === 'paid') {
        const periods = invoice.lines?.data?.filter(line => line.price?.id === price).map(line => line.period?.end * 1000).filter(Number.isFinite) || [];
        paidUntil = Math.max(paidUntil, 0, ...periods);
      }
      if (!sub || ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'].includes(sub.status)) paidUntil = 0;
      tx.set(ctx.ref, {
        billingVersion: 1, subscriptionId: sub?.id || null,
        subscriptionStatus: sub?.status || null, paidUntil,
        cancelAtPeriodEnd: sub?.cancel_at_period_end === true,
        billingUpdatedAt: Date.now(),
      }, { merge: true });
    });
  }
  const startFamilyTrial = onCall({ ...options, secrets: [] }, async request => {
    const ctx = await ownerContext(request);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ctx.ref);
      try { tx.set(ctx.ref, startTrial(snap.data()), { merge: true }); }
      catch (error) { throw new HttpsError('failed-precondition', error.message); }
    });
    return { ok: true };
  });
  const createFamilyCheckout = onCall(options, async request => {
    const ctx = await ownerContext(request);
    if (billingState((await ctx.ref.get()).data()).complimentary) throw new HttpsError('failed-precondition', 'このファミリーはお支払い不要でPremiumを利用できます');
    const { price, origin } = config();
    const priceData = await api(`prices/${price}`);
    if (!priceData.active || priceData.currency !== 'jpy' || priceData.unit_amount !== PRICE_YEN || priceData.recurring?.interval !== 'month' || priceData.recurring?.interval_count !== 1) {
      throw new HttpsError('failed-precondition', '月額料金の設定が一致していません');
    }
    let privateData = (await ctx.privateRef.get()).data() || {};
    if (!privateData.customerId) {
      const customer = await api('customers', { 'metadata[familyId]': ctx.familyId }, `twinly-customer-${ctx.familyId}`);
      // A single persistent customer per family is needed for duplicate prevention.
      await db.runTransaction(async tx => {
        const existing = await tx.get(ctx.privateRef);
        if (!existing.data()?.customerId) tx.set(ctx.privateRef, { customerId: customer.id }, { merge: true });
      });
      privateData = (await ctx.privateRef.get()).data();
    }
    await sync(ctx);
    const accessData = (await ctx.ref.get()).data() || {};
    const state = billingState(accessData);
    if (state.hasSubscription) throw new HttpsError('already-exists', '契約があります。「契約・支払いを管理」から確認してください');
    if (state.status === 'trialing') throw new HttpsError('failed-precondition', '無料体験の終了後にお支払いください');
    let attempt = await db.runTransaction(async tx => {
      const snap = await tx.get(ctx.privateRef);
      const data = snap.data();
      if (data.checkoutAttempt) return data.checkoutAttempt;
      const next = { id: crypto.randomUUID(), createdAt: Date.now(), price };
      tx.set(ctx.privateRef, { checkoutAttempt: next }, { merge: true });
      return next;
    });
    if (attempt.sessionId) {
      const session = await api(`checkout/sessions/${attempt.sessionId}`);
      if (session.status === 'open') return { url: session.url };
      if (session.status === 'complete' && !(session.subscription === accessData.subscriptionId && ['canceled', 'incomplete_expired'].includes(accessData.subscriptionStatus))) throw new HttpsError('failed-precondition', '支払いを確認中です。少し待ってから再度確認してください');
      // Rotate only after Stripe confirms expiration. Concurrent callers share the new attempt.
      attempt = await db.runTransaction(async tx => {
        const snap = await tx.get(ctx.privateRef);
        const current = snap.data().checkoutAttempt;
        if (current.id !== attempt.id) return current;
        const next = { id: crypto.randomUUID(), createdAt: Date.now(), price };
        tx.set(ctx.privateRef, { checkoutAttempt: next }, { merge: true });
        return next;
      });
    }
    if (Date.now() - attempt.createdAt > 23 * 3600000 && !attempt.sessionId) throw new HttpsError('failed-precondition', '前回の決済状況を確認する必要があります。お問い合わせください');
    const session = await api('checkout/sessions', {
      mode: 'subscription', customer: privateData.customerId, locale: 'ja',
      'payment_method_types[0]': 'card', 'line_items[0][price]': attempt.price,
      'line_items[0][quantity]': '1', client_reference_id: ctx.familyId,
      'subscription_data[metadata][familyId]': ctx.familyId,
      success_url: `${origin}/?billing=success`, cancel_url: `${origin}/?billing=cancel`,
    }, `twinly-checkout-${attempt.id}`);
    await ctx.privateRef.set({ checkoutAttempt: { ...attempt, sessionId: session.id } }, { merge: true });
    return { url: session.url };
  });
  const createFamilyBillingPortal = onCall(options, async request => {
    const ctx = await ownerContext(request);
    const customerId = (await ctx.privateRef.get()).data()?.customerId;
    if (!customerId) throw new HttpsError('failed-precondition', '契約がありません');
    const session = await api('billing_portal/sessions', { customer: customerId, return_url: `${config().origin}/?billing=return`, locale: 'ja' });
    return { url: session.url };
  });
  const refreshFamilyBilling = onCall(options, async request => {
    const ctx = await ownerContext(request);
    await sync(ctx);
    return { ok: true };
  });
  const stripeWebhook = onRequest({ ...options, secrets: [secret, webhookSecret] }, async (req, res) => {
    if (req.method !== 'POST') return res.sendStatus(405);
    if (!enabled()) return res.sendStatus(503);
    let event;
    try { event = verifyStripeEvent(req.rawBody, req.headers['stripe-signature'], webhookSecret.value()); }
    catch { return res.sendStatus(400); }
    if (!['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'].includes(event.type)) return res.sendStatus(200);
    try {
      const customerId = event.data.object.customer;
      if (typeof customerId !== 'string') return res.sendStatus(200);
      const matches = await db.collection('familyBilling').where('customerId', '==', customerId).limit(2).get();
      if (matches.size !== 1) return res.sendStatus(200);
      const privateRef = matches.docs[0].ref;
      const familyId = privateRef.id;
      await sync({ familyId, privateRef, ref: db.collection('families').doc(familyId).collection('services').doc('access') });
      return res.sendStatus(200);
    } catch { return res.sendStatus(500); }
  });
  return { startFamilyTrial, createFamilyCheckout, createFamilyBillingPortal, refreshFamilyBilling, stripeWebhook };
};
