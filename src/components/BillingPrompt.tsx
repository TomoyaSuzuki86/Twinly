import { useEffect, useRef, useState } from 'react';
import { useCurrentFamilyAccess } from '@/lib/family-access-state';
import { billingAction } from '@/lib/billing';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
export function BillingPrompt() {
  const { key, access } = useCurrentFamilyAccess();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shown = useRef('');
  const billing = access?.billing;
  useEffect(() => {
    if (!billing || billing.complimentary || !access?.canPreview) return;
    const returning = new URLSearchParams(window.location.search).get('billing');
    const promptKey = `${key}:${billing.trialEndsAt}`;
    if ((billing.status === 'expired' && shown.current !== promptKey) || returning) {
      shown.current = promptKey;
      setOpen(true);
    }
    if (returning) {
      const url = new URL(window.location.href);
      url.searchParams.delete('billing');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      if (returning !== 'cancel') void billingAction('refreshFamilyBilling').catch(() => setError('支払い状況を確認できません。「支払い状況を確認」を押してください。'));
    }
  }, [key, billing?.status, billing?.trialEndsAt, access?.canPreview]);
  if (!billing || !access?.canPreview) return null;
  const act = async (action: Parameters<typeof billingAction>[0]) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await billingAction(action); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '決済画面を開けませんでした'); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{billing.status === 'active' ? 'Premiumをご利用いただけます' : 'Premiumのお支払い'}</DialogTitle>
        <DialogDescription>{billing.status === 'expired' ? '7日間の無料体験が終了しました。基本の育児記録は無料で続けられます。' : '契約と支払い状況を確認できます。'}</DialogDescription>
      </DialogHeader>
      <p>月額 ¥{billing.priceYen}。お支払い後は毎月自動更新されます。解約は「契約・支払いを管理」から行えます。</p>
      {billing.status !== 'active' && <Button disabled={busy} onClick={() => void act(billing.hasSubscription ? 'createFamilyBillingPortal' : 'createFamilyCheckout')}>{billing.hasSubscription ? '契約・支払いを管理' : '支払いへ進む'}</Button>}
      <Button variant="outline" disabled={busy} onClick={() => void act('refreshFamilyBilling')}>支払い状況を確認</Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>{billing.status === 'active' ? '閉じる' : '無料版を続ける'}</Button>
      {error && <p role="alert">{error}</p>}
    </DialogContent>
  </Dialog>;
}
