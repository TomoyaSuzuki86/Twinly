import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';
import { getFamilyAccess } from './family-access';
import { getCurrentFamilyAccessState, publishFamilyAccessState } from './family-access-state';

export type BillingAction = 'startFamilyTrial' | 'createFamilyCheckout' | 'createFamilyBillingPortal' | 'refreshFamilyBilling' | 'expireDevelopmentFamilyTrial';
export type BillingUrlAction = Extract<BillingAction, 'createFamilyCheckout' | 'createFamilyBillingPortal'>;

const developmentBillingDemo = import.meta.env.VITE_TWINLY_BILLING_DEMO === 'true';

const developmentNames: Record<BillingAction, string> = {
  startFamilyTrial: 'developmentStartFamilyTrial',
  createFamilyCheckout: 'developmentCreateFamilyCheckout',
  createFamilyBillingPortal: 'developmentCreateFamilyBillingPortal',
  refreshFamilyBilling: 'developmentRefreshFamilyBilling',
  expireDevelopmentFamilyTrial: 'developmentExpireFamilyTrial',
};

const validateBillingUrl = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) {
    throw new Error('決済画面のURLを確認できません');
  }
  return url.href;
};

async function invokeBillingAction(action: BillingAction) {
  if (!functions) throw new Error('サーバー設定がありません');
  if (action === 'expireDevelopmentFamilyTrial' && !developmentBillingDemo) throw new Error('development専用の操作です');
  const key = getCurrentFamilyAccessState().key;
  const callableName = developmentBillingDemo ? developmentNames[action] : action;
  const result = (await httpsCallable<unknown, { url?: string }>(functions, callableName)({})).data;
  return { key, result };
}

export async function prepareBillingUrl(action: BillingUrlAction) {
  const { key, result } = await invokeBillingAction(action);
  if (getCurrentFamilyAccessState().key !== key) return null;
  if (!result.url) throw new Error('決済画面を準備できませんでした');
  return validateBillingUrl(result.url);
}

export function navigateBillingUrl(url: string) {
  window.location.assign(validateBillingUrl(url));
}

export async function billingAction(action: BillingAction) {
  const { key, result } = await invokeBillingAction(action);
  if (getCurrentFamilyAccessState().key !== key) return;
  if (result.url) {
    navigateBillingUrl(result.url);
    return;
  }
  const access = await getFamilyAccess();
  if (getCurrentFamilyAccessState().key === key) publishFamilyAccessState({ key, access, error: '' });
}
