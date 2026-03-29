import { supabase } from '@/integrations/supabase/client';

export async function startCheckoutSession(priceId?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: { priceId, origin: window.location.origin },
  });
  if (error) throw new Error(error.message);
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error('No checkout URL returned');
  window.location.href = url;
}

export async function openCustomerPortal(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('create-portal-session', {
    body: { origin: window.location.origin },
  });
  if (error) throw new Error(error.message);
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error('No portal URL returned');
  window.location.href = url;
}
