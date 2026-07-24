// Thin wrappers used by Settings → Billing for plan changes, cancel, portal.
// All call edge functions; the user must be signed in. exportAccountData/
// deleteAccount are provider-agnostic and stay in paddleClient.ts.
import { supabase } from '@/integrations/supabase/client';
import { getLemonSqueezyEnvironment } from '@/lib/lemonSqueezy';
import type { PlanPriceId } from '@/hooks/useLemonSqueezyCheckout';

export async function openCustomerPortal(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('lemonsqueezy-portal', {
    body: { environment: getLemonSqueezyEnvironment() },
  });
  if (error) throw new Error(error.message);
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error('No portal URL returned');
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function changePlan(
  planKey: Exclude<PlanPriceId, 'lifetime_pro_onetime'>,
): Promise<{ scheduled?: boolean; effectiveAt?: string }> {
  const { data, error } = await supabase.functions.invoke('lemonsqueezy-change-plan', {
    body: { planKey, environment: getLemonSqueezyEnvironment() },
  });
  if (error) throw new Error(error.message);
  return (data as { scheduled?: boolean; effectiveAt?: string }) ?? {};
}

export async function cancelSubscription(): Promise<void> {
  const { error } = await supabase.functions.invoke('lemonsqueezy-cancel', {
    body: { environment: getLemonSqueezyEnvironment() },
  });
  if (error) throw new Error(error.message);
}

/** Reactivates a subscription that was scheduled to cancel at period end. */
export async function resumeSubscription(): Promise<void> {
  const { error } = await supabase.functions.invoke('lemonsqueezy-resume', {
    body: { environment: getLemonSqueezyEnvironment() },
  });
  if (error) throw new Error(error.message);
}
