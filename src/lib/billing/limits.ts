/**
 * Client-side plan limits (must match supabase/functions/_shared/billing.ts).
 */
export type PlanKey = 'free' | 'trialing' | 'starter' | 'pro' | 'enterprise' | 'lifetime';

export const PLAN_LIMITS: Record<
  PlanKey,
  { aiPerDay: number; exportsPerDay: number; insightReadsPerDay: number }
> = {
  free: { aiPerDay: 2, exportsPerDay: 1, insightReadsPerDay: 3 },
  trialing: { aiPerDay: 5, exportsPerDay: 3, insightReadsPerDay: 10 },
  starter: { aiPerDay: 20, exportsPerDay: 20, insightReadsPerDay: 50 },
  pro: { aiPerDay: 100, exportsPerDay: 100, insightReadsPerDay: 200 },
  enterprise: { aiPerDay: 9999, exportsPerDay: 9999, insightReadsPerDay: 9999 },
  lifetime: { aiPerDay: 9999, exportsPerDay: 9999, insightReadsPerDay: 9999 },
};

export type SubscriptionRow = {
  status: string;
  plan_key: string | null;
  trial_end: string | null;
  current_period_end: string | null;
};

export function effectivePlan(sub: SubscriptionRow | null): PlanKey {
  const now = Date.now();
  if (!sub) return 'free';
  if (sub.status === 'trialing') return 'trialing';
  if (sub.status === 'active' || sub.status === 'past_due') {
    const pk = (sub.plan_key || 'starter') as PlanKey;
    if (pk in PLAN_LIMITS && pk !== 'free' && pk !== 'trialing') return pk;
    return 'starter';
  }
  if (sub.trial_end && new Date(sub.trial_end).getTime() > now) return 'trialing';
  if (
    sub.current_period_end &&
    new Date(sub.current_period_end).getTime() > now &&
    sub.status &&
    ['canceled', 'unpaid'].includes(sub.status)
  ) {
    const pk = (sub.plan_key || 'free') as PlanKey;
    if (pk in PLAN_LIMITS) return pk;
  }
  return 'free';
}
