import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';
import { getFamilyAccess } from './family-access';
import { getCurrentFamilyAccessState, publishFamilyAccessState } from './family-access-state';

type BillingAction = 'startFamilyTrial' | 'createFamilyCheckout' | 'createFamilyBillingPortal' | 'refreshFamilyBilling' | 'expireDevelopmentFamilyTrial';

const developmentBillingDemo = import.meta.env.VITE_TWINLY_BILLING_DEMO === 'true';

const developmentNames: Record<BillingAction, string> = {
  startFamilyTrial: 'developmentStartFamilyTrial',
  createFamilyCheckout: 'developmentCreateFamilyCheckout',
  createFamilyBillingPortal: 'developmentCreateFamilyBillingPortal',
  refreshFamilyBilling: 'developmentRefreshFamilyBilling',
  expireDevelopmentFamilyTrial: 'developmentExpireFamilyTrial',
};

export async function billingAction(action: BillingAction) {
  if (!functions) throw new Error('サーバー設定がありません');
  if (action === 'expireDevelopmentFamilyTrial' && !developmentBillingDemo) throw new Error('development専用の操作です');
  const key = getCurrentFamilyAccessState().key;
  const callableName = developmentBillingDemo ? developmentNames[action] : action;
  const result = (await httpsCallable<unknown, { url?: string }>(functions, callableName)({})).data;
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
