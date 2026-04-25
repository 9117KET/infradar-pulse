// Thin wrappers used by Settings → Billing for plan changes, cancel, portal,
// and account export/delete. All call edge functions; the user must be signed in.
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

export async function changePlan(
  priceId:
    | 'starter_monthly'
    | 'starter_yearly'
    | 'pro_monthly'
    | 'pro_yearly'
    | 'starter_monthly_no_trial'
    | 'starter_yearly_no_trial'
    | 'pro_monthly_no_trial'
    | 'pro_yearly_no_trial',
): Promise<{ scheduled?: boolean; effectiveAt?: string }> {
  const { data, error } = await supabase.functions.invoke('paddle-change-plan', {
    body: { priceId, environment: getPaddleEnvironment() },
  });
  if (error) throw new Error(error.message);
  return (data as { scheduled?: boolean; effectiveAt?: string }) ?? {};
}

export async function cancelSubscription(): Promise<void> {
  const { error } = await supabase.functions.invoke('paddle-cancel', {
    body: { environment: getPaddleEnvironment() },
  });
  if (error) throw new Error(error.message);
}

/** Reactivates a subscription that was scheduled to cancel at period end. */
export async function resumeSubscription(): Promise<void> {
  const { error } = await supabase.functions.invoke('paddle-resume', {
    body: { environment: getPaddleEnvironment() },
  });
  if (error) throw new Error(error.message);
}

/** Triggers a JSON download of the signed-in user's data. */
export async function exportAccountData(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in required');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/account-export`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `infradar-account-${session.user.id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('account-delete', { body: {} });
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
  window.location.href = '/';
}
