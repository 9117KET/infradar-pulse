import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReferralDashboardCard } from './ReferralDashboardCard';

// --- Mocks ------------------------------------------------------------------
const entitlements = {
  qualifiedReferrals: 0,
  pendingReferrals: 0,
  referralBonus: 0,
  refresh: vi.fn(),
};

vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: () => entitlements,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

// referral_codes lookup returns an existing code so the link renders.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { code: 'ABC123' } }) }),
      }),
    }),
  },
}));

function renderCard() {
  return render(
    <MemoryRouter>
      <ReferralDashboardCard />
    </MemoryRouter>,
  );
}

describe('ReferralDashboardCard', () => {
  beforeEach(() => {
    entitlements.qualifiedReferrals = 0;
    entitlements.pendingReferrals = 0;
    entitlements.referralBonus = 0;
    toast.mockClear();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('shows the share link and a +0/day bonus with no referrals', async () => {
    renderCard();
    const input = await screen.findByDisplayValue('https://infradarai.com?ref=ABC123');
    expect(input).toBeInTheDocument();
    expect(screen.getByText('+0/day')).toBeInTheDocument();
    expect(screen.getByText('qualified')).toBeInTheDocument();
  });

  it('reflects earned bonus and qualified count', async () => {
    entitlements.qualifiedReferrals = 3;
    entitlements.referralBonus = 9;
    renderCard();
    await screen.findByDisplayValue('https://infradarai.com?ref=ABC123');
    expect(screen.getByText('+9/day')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('marks the bonus as maxed at the +30/day cap', async () => {
    entitlements.qualifiedReferrals = 50;
    entitlements.referralBonus = 30;
    renderCard();
    await screen.findByDisplayValue('https://infradarai.com?ref=ABC123');
    expect(screen.getByText('+30/day (max)')).toBeInTheDocument();
  });

  it('copies the referral link to the clipboard', async () => {
    renderCard();
    const btn = await screen.findByLabelText('Copy referral link');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://infradarai.com?ref=ABC123');
    });
    expect(toast).toHaveBeenCalled();
  });
});
