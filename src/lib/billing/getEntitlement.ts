/**
 * Resolves current user billing plan and limits (mirrors edge `_shared/entitlementCheck` for the logged-in user).
 */
import { supabase } from '@/integrations/supabase/client';
import { effectivePlan, PLAN_LIMITS, PlanKey } from '@/lib/billing/limits';
import { getPaddleEnvironment } from '@/lib/paddle';

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
  const environment = getPaddleEnvironment();

  const [
    { data: staffRoles, error: staffError },
    { data: sub },
    { data: lifetime },
    { data: pilot },
    { data: trial },
  ] = await Promise.all([
    // Fetch only admin/researcher rows — avoids maybeSingle() error when user has multiple role rows.
    supabase.from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'researcher']),
    supabase
      .from('subscriptions')
      .select('status, plan_key, entitlement_plan_key, entitlement_plan_until, trial_end, current_period_end')
      .eq('user_id', user.id)
      .eq('environment', environment)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // lifetime_grants is new — generated types not yet refreshed
    (supabase as any)
      .from('lifetime_grants')
      .select('id')
      .eq('user_id', user.id)
      .eq('environment', environment)
      .maybeSingle(),
    (supabase as any)
      .from('pilot_access_grants')
      .select('id')
      .eq('user_id', user.id)
      .eq('environment', environment)
      .eq('status', 'active')
      .gt('ends_at', new Date().toISOString())
      .maybeSingle(),
    (supabase as any)
      .from('no_card_trial_grants')
      .select('id')
      .eq('user_id', user.id)
      .eq('environment', environment)
      .eq('status', 'active')
      .gt('ends_at', new Date().toISOString())
      .maybeSingle(),
  ]);

  // If we can't determine staff status, fail closed rather than silently downgrading an admin.
  if (staffError) return null;

  const bypass = (staffRoles?.length ?? 0) > 0;
  if (bypass) {
    return { plan: 'enterprise', limits: PLAN_LIMITS.enterprise, staffBypass: true };
  }
  if (lifetime) {
    return { plan: 'lifetime', limits: PLAN_LIMITS.lifetime, staffBypass: false };
  }
  if (pilot) {
    return { plan: 'enterprise', limits: PLAN_LIMITS.enterprise, staffBypass: false };
  }
  if (trial) {
    return { plan: 'trialing', limits: PLAN_LIMITS.trialing, staffBypass: false };
  }

  const plan = effectivePlan(sub);
  return { plan, limits: PLAN_LIMITS[plan], staffBypass: false };
}
