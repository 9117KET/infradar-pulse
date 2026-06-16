import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FoundingAccessProvider, useFoundingAccess } from './FoundingAccessProvider';

// --- Mocks ------------------------------------------------------------------
const insert = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert }) },
}));

let mockUser: { id: string; email: string } | null = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: () => ({ plan: 'free', usage: { ai_generation: 1 } }),
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const trackEvent = vi.fn();
vi.mock('@/lib/analytics', () => ({ trackEvent: (...a: unknown[]) => trackEvent(...a) }));

function Harness() {
  const { openFoundingAccess } = useFoundingAccess();
  return (
    <button onClick={() => openFoundingAccess({ planKey: 'pro', planLabel: 'Pro', billingCycle: 'monthly', source: 'pricing' })}>
      open
    </button>
  );
}

function renderProvider() {
  return render(
    <FoundingAccessProvider>
      <Harness />
    </FoundingAccessProvider>,
  );
}

describe('FoundingAccessProvider', () => {
  beforeEach(() => {
    insert.mockClear();
    toast.mockClear();
    trackEvent.mockClear();
    mockUser = null;
  });

  it('opens the reserve modal for the requested plan and tracks the open', () => {
    renderProvider();
    fireEvent.click(screen.getByText('open'));
    expect(screen.getByText('Reserve your Pro plan')).toBeInTheDocument();
    expect(trackEvent).toHaveBeenCalledWith('founding_access_opened', expect.objectContaining({ plan: 'pro' }), 'monetization');
  });

  it('captures sentiment + price + email and records the interest', async () => {
    renderProvider();
    fireEvent.click(screen.getByText('open'));

    fireEvent.click(screen.getByText('Maybe — keep me posted'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 49'), { target: { value: '49' } });
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'lead@acme.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reserve my spot' }));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_key: 'pro',
        billing_cycle: 'monthly',
        sentiment: 'maybe',
        expected_price: 49,
        email: 'lead@acme.com',
        source: 'pricing',
        current_plan: 'free',
      }),
    );
    await screen.findByText("You're on the founding list");
    expect(trackEvent).toHaveBeenCalledWith('plan_interest_submitted', expect.objectContaining({ sentiment: 'maybe', expected_price: 49 }), 'monetization');
  });

  it('blocks submission when an anonymous user gives no email', async () => {
    renderProvider();
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(screen.getByRole('button', { name: 'Reserve my spot' }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(insert).not.toHaveBeenCalled();
  });
});
