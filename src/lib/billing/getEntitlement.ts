/**
 * Resolves current user billing plan and limits (mirrors edge `_shared/entitlementCheck` for the logged-in user).
 */
import { supabase } from '@/integrations/supabase/client';
import { effectivePlan, PLAN_LIMITS, PlanKey } from '@/lib/billing/limits';

export type EntitlementSnapshot = {
  plan: PlanKey;
  limits: (typeof PLAN_LIMITS)[PlanKey];
  staffBypass: boolean;
};

export async function getEntitlement(): Promise<EntitlementSnapshot | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: roleRow }, { data: sub }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
    supabase.from('subscriptions').select('status, plan_key, trial_end, current_period_end').eq('user_id', user.id).maybeSingle(),
  ]);

  const bypass = roleRow?.role === 'admin' || roleRow?.role === 'researcher';
  if (bypass) {
    return { plan: 'enterprise', limits: PLAN_LIMITS.enterprise, staffBypass: true };
  }

  const plan = effectivePlan(sub);
  return { plan, limits: PLAN_LIMITS[plan], staffBypass: false };
}
