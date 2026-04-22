// Thin wrapper used by Settings → Billing to open the Paddle customer portal.
// Checkout itself is handled by usePaddleCheckout (Paddle.js overlay).
import { supabase } from '@/integrations/supabase/client';
import { getPaddleEnvironment } from '@/lib/paddle';

export async function openCustomerPortal(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('paddle-portal', {
    body: { environment: getPaddleEnvironment() },
  });
  if (error) throw new Error(error.message);
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error('No portal URL returned');
  window.open(url, '_blank', 'noopener,noreferrer');
}
