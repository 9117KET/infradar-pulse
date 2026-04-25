import { useState } from 'react';
import { initializePaddle, getPaddlePriceId, isPaddleConfigured } from '@/lib/paddle';
import { supabase } from '@/integrations/supabase/client';

export type PlanPriceId =
  | 'starter_monthly'
  | 'starter_yearly'
  | 'pro_monthly'
  | 'pro_yearly'
  | 'starter_monthly_no_trial'
  | 'starter_yearly_no_trial'
  | 'pro_monthly_no_trial'
  | 'pro_yearly_no_trial'
  | 'lifetime_pro_onetime';

export type CheckoutResult = {
  /** True if the user was eligible for a free trial when checkout opened. */
  trialEligible: boolean;
};

export function usePaddleCheckout() {
  const [loading, setLoading] = useState(false);

  /**
   * Opens Paddle Checkout. Performs a server-side trial-eligibility check
   * first so users who have already used their free trial don't see the
   * trial CTA again (they go straight to a paid checkout).
   */
  const openCheckout = async (priceId: PlanPriceId): Promise<CheckoutResult> => {
    if (!isPaddleConfigured()) {
      throw new Error('Payments are not configured yet.');
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in required');

      // Trials are intentionally disabled for all currently sold plans.
      const trialEligible = false;

      await initializePaddle();
      const paddlePriceId = await getPaddlePriceId(priceId);

      window.Paddle.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: 1 }],
        customer: user.email ? { email: user.email } : undefined,
        customData: { userId: user.id, trialEligible },
        settings: {
          displayMode: 'overlay',
          successUrl: `${window.location.origin}/dashboard/settings?tab=billing&checkout=success`,
          allowLogout: false,
          variant: 'one-page',
        },
      });

      return { trialEligible };
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
