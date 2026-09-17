import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BillingPrompt } from './BillingPrompt';
import { clearFamilyAccessState, publishFamilyAccessState } from '@/lib/family-access-state';

const mock = vi.hoisted(() => ({
  action: vi.fn(),
  prepare: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/lib/billing', () => ({
  billingAction: mock.action,
  prepareBillingUrl: mock.prepare,
  navigateBillingUrl: mock.navigate,
}));

const expiredAccess = {
  plan: 'free' as const,
  canPreview: true,
  billing: {
    status: 'expired' as const,
    trialEndsAt: Date.now() - 1,
    paidUntil: 0,
    priceYen: 200,
    canStartTrial: false,
    hasSubscription: false,
    cancelAtPeriodEnd: false,
  },
  features: {
    aiReview: false,
    aiChat: false,
    dailySummaryEmail: false,
  },
};

const setExpiredAccess = () => publishFamilyAccessState({ key: 'user:test', access: expiredAccess, error: '' });

describe('BillingPrompt', () => {
  beforeEach(() => {
    mock.action.mockReset().mockResolvedValue(undefined);
    mock.prepare.mockReset().mockResolvedValue('https://checkout.stripe.com/c/pay/test');
    mock.navigate.mockReset();
    window.history.replaceState({}, '', '/');
    setExpiredAccess();
  });

  afterEach(() => {
    cleanup();
    clearFamilyAccessState();
    window.history.replaceState({}, '', '/');
  });

  it('uses an edge-to-edge mobile bottom sheet and removes the redundant manual status button', async () => {
    render(<BillingPrompt />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveClass('bottom-0', 'left-0', 'top-auto', 'max-w-none', 'border-x-0', 'border-b-0');
    expect(screen.queryByRole('button', { name: '支払い状況を確認' })).not.toBeInTheDocument();
  });

  it('refreshes payment state automatically after returning from Stripe', async () => {
    window.history.replaceState({}, '', '/?billing=success');
    render(<BillingPrompt />);
    await waitFor(() => expect(mock.action).toHaveBeenCalledWith('refreshFamilyBilling'));
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('button', { name: '支払い状況を確認' })).not.toBeInTheDocument();
  });

  it('prefetches development checkout so the payment button can navigate immediately', async () => {
    render(<BillingPrompt />);
    const button = await screen.findByRole('button', { name: '支払いへ進む' });
    if (import.meta.env.VITE_TWINLY_BILLING_DEMO === 'true') {
      await waitFor(() => expect(mock.prepare).toHaveBeenCalledWith('createFamilyCheckout'));
      fireEvent.click(button);
      await waitFor(() => expect(mock.navigate).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/test'));
    } else {
      fireEvent.click(button);
      await waitFor(() => expect(mock.action).toHaveBeenCalledWith('createFamilyCheckout'));
    }
  });
});
