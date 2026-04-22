import { useState } from 'react';
import { initializePaddle, getPaddlePriceId, isPaddleConfigured } from '@/lib/paddle';
import { supabase } from '@/integrations/supabase/client';

export type PlanPriceId = 'starter_monthly' | 'pro_monthly';

export function usePaddleCheckout() {
  const [loading, setLoading] = useState(false);

  const openCheckout = async (priceId: PlanPriceId): Promise<void> => {
    if (!isPaddleConfigured()) {
      throw new Error('Payments are not configured yet.');
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in required');

      await initializePaddle();
      const paddlePriceId = await getPaddlePriceId(priceId);

      window.Paddle.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: 1 }],
        customer: user.email ? { email: user.email } : undefined,
        customData: { userId: user.id },
        settings: {
          displayMode: 'overlay',
          successUrl: `${window.location.origin}/dashboard/settings?tab=billing&checkout=success`,
          allowLogout: false,
          variant: 'one-page',
        },
      });
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
