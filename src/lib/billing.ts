import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';
import { getFamilyAccess } from './family-access';
import { getCurrentFamilyAccessState, publishFamilyAccessState } from './family-access-state';
export async function billingAction(action: 'startFamilyTrial' | 'createFamilyCheckout' | 'createFamilyBillingPortal' | 'refreshFamilyBilling') {
  if (!functions) throw new Error('サーバー設定がありません');
  const key = getCurrentFamilyAccessState().key;
  const result = (await httpsCallable<unknown, { url?: string }>(functions, action)({})).data;
  if (getCurrentFamilyAccessState().key !== key) return;
  if (result.url) {
    const url = new URL(result.url);
    if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) throw new Error('決済画面のURLを確認できません');
    window.location.assign(url.href);
    return;
  }
  const access = await getFamilyAccess();
  if (getCurrentFamilyAccessState().key === key) publishFamilyAccessState({ key, access, error: '' });
}
