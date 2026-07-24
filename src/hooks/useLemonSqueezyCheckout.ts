import { useState } from 'react';
import { initializeLemonSqueezy, openLemonSqueezyCheckout, isLemonSqueezyConfigured } from '@/lib/lemonSqueezy';
import { supabase } from '@/integrations/supabase/client';
import { getStoredReferralCode } from '@/lib/utm';
import { trackEvent } from '@/lib/analytics';

export type PlanPriceId =
  | 'starter_monthly'
  | 'starter_yearly'
  | 'pro_monthly'
  | 'pro_yearly'
  | 'lifetime_pro_onetime';

export type CheckoutResult = {
  /** True if the user was eligible for a free trial when checkout opened. */
  trialEligible: boolean;
};

export function useLemonSqueezyCheckout() {
  const [loading, setLoading] = useState(false);

  /**
   * Opens Lemon Squeezy Checkout. The checkout object is created server-side
   * (lemonsqueezy-create-checkout) so the variant/price can't be tampered
   * with by the client — mirrors the trust boundary the Paddle integration
   * used (get-paddle-price resolving price IDs server-side).
   */
  const openCheckout = async (priceId: PlanPriceId): Promise<CheckoutResult> => {
    if (!isLemonSqueezyConfigured()) {
      throw new Error('Payments are not configured yet.');
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in required');

      // Trials are intentionally disabled for all currently sold plans.
      const trialEligible = false;

      await initializeLemonSqueezy();
      const referralCode = getStoredReferralCode();

      void trackEvent('checkout_started', { price_id: priceId, trial_eligible: trialEligible }, 'monetization');

      const { data, error } = await supabase.functions.invoke('lemonsqueezy-create-checkout', {
        body: {
          planKey: priceId,
          referralCode: referralCode ?? undefined,
          redirectUrl: `${window.location.origin}/dashboard/settings?tab=billing&checkout=success`,
        },
      });
      if (error) throw new Error(error.message);
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error('No checkout URL returned');

      openLemonSqueezyCheckout(url);

      return { trialEligible };
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
