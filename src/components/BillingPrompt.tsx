import { useEffect, useRef, useState } from 'react';
import { useCurrentFamilyAccess } from '@/lib/family-access-state';
import { billingAction, navigateBillingUrl, prepareBillingUrl } from '@/lib/billing';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

const developmentBillingDemo = import.meta.env.VITE_TWINLY_BILLING_DEMO === 'true';

export function BillingPrompt() {
  const { key, access } = useCurrentFamilyAccess();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const checkoutPromise = useRef<Promise<string | null> | null>(null);
  const shown = useRef('');
  const billing = access?.billing;

  const prepareCheckout = () => {
    if (checkoutUrl) return Promise.resolve(checkoutUrl);
    if (!checkoutPromise.current) {
      checkoutPromise.current = prepareBillingUrl('createFamilyCheckout')
        .then((url) => {
          if (url) setCheckoutUrl(url);
          return url;
        })
        .finally(() => {
          checkoutPromise.current = null;
        });
    }
    return checkoutPromise.current;
  };

  useEffect(() => {
    setCheckoutUrl('');
    checkoutPromise.current = null;
  }, [key]);

  useEffect(() => {
    if (!billing || billing.complimentary || !access?.canPreview) return;
    const returning = new URLSearchParams(window.location.search).get('billing');
    const promptKey = `${key}:${billing.status}:${billing.trialEndsAt}`;
    const developmentTrial = developmentBillingDemo && billing.status === 'trialing';
    if (((billing.status === 'expired' || developmentTrial) && shown.current !== promptKey) || returning) {
      shown.current = promptKey;
      setOpen(true);
    }
    if (returning) {
      const url = new URL(window.location.href);
      url.searchParams.delete('billing');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      if (returning !== 'cancel') {
        setSyncing(true);
        setRefreshFailed(false);
        setError('');
        void billingAction('refreshFamilyBilling')
          .catch(() => {
            setRefreshFailed(true);
            setError('支払い状況を自動反映できませんでした。再確認してください。');
          })
          .finally(() => setSyncing(false));
      }
    }
  }, [key, billing?.status, billing?.trialEndsAt, access?.canPreview]);

  useEffect(() => {
    if (!developmentBillingDemo || !open || !billing || billing.status !== 'expired' || billing.hasSubscription || checkoutUrl) return;
    void prepareCheckout().catch(() => {
      // Background preparation is best-effort. Surface an error only if the user actually taps the payment button.
    });
  }, [open, billing?.status, billing?.hasSubscription, checkoutUrl]);

  if (!billing || !access?.canPreview) return null;

  const act = async (action: Parameters<typeof billingAction>[0]) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setRefreshFailed(false);
    try {
      await billingAction(action);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '決済画面を開けませんでした');
    } finally {
      setBusy(false);
    }
  };

  const openCheckout = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (developmentBillingDemo && !billing.hasSubscription) {
        const url = checkoutUrl || await prepareCheckout();
        if (!url) throw new Error('決済画面を準備できませんでした');
        navigateBillingUrl(url);
      } else {
        await billingAction(billing.hasSubscription ? 'createFamilyBillingPortal' : 'createFamilyCheckout');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '決済画面を開けませんでした');
    } finally {
      setBusy(false);
    }
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="bottom-0 left-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-5 rounded-t-2xl border-x-0 border-b-0 p-5 pb-6 sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:max-w-md sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border sm:p-6">
      <DialogHeader>
        <DialogTitle>{billing.status === 'active' ? 'Premiumをご利用いただけます' : billing.status === 'trialing' ? 'Premium無料体験中' : 'Premiumのお支払い'}</DialogTitle>
        <DialogDescription>
          {syncing
            ? 'お支払いを反映しています…'
            : billing.status === 'active'
              ? 'お支払いが反映されました。Premium機能をご利用いただけます。'
              : billing.status === 'expired'
                ? '7日間の無料体験が終了しました。基本の育児記録は無料で続けられます。'
                : billing.status === 'trialing'
                  ? '無料体験中です。developmentでは7日経過を手動で再現できます。'
                  : '契約と支払い状況を確認できます。'}
        </DialogDescription>
      </DialogHeader>
      <p>月額 ¥{billing.priceYen}。お支払い後は毎月自動更新されます。解約は「契約・支払いを管理」から行えます。</p>
      {developmentBillingDemo && billing.status === 'trialing' && <Button variant="outline" disabled={busy || syncing} onClick={() => void act('expireDevelopmentFamilyTrial')}>{busy ? '処理中…' : '7日分を今すぐ消化（development）'}</Button>}
      {billing.status !== 'active' && billing.status !== 'trialing' && <Button disabled={busy || syncing} onClick={() => void openCheckout()}>{busy ? '決済画面を開いています…' : billing.hasSubscription ? '契約・支払いを管理' : '支払いへ進む'}</Button>}
      {syncing && <p className="text-center text-sm text-muted-foreground">Stripeのお支払い結果を自動確認しています。</p>}
      {refreshFailed && <Button variant="outline" disabled={busy || syncing} onClick={() => void act('refreshFamilyBilling')}>再確認する</Button>}
      <Button variant="ghost" disabled={syncing} onClick={() => setOpen(false)}>{billing.status === 'active' ? '閉じる' : '無料版を続ける'}</Button>
      {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
    </DialogContent>
  </Dialog>;
}
