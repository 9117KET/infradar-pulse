/**
 * Client-side plan limits (must match supabase/functions/_shared/billing.ts).
 *
 * Hourly caps are an anti-burst guard so a script can't drain the daily
 * quota in one second. Hourly cap of 0 means "no hourly limit" (used for
 * enterprise / staff bypass).
 */
export type PlanKey = 'free' | 'trialing' | 'starter' | 'pro' | 'enterprise' | 'lifetime';

export type PlanLimit = {
  aiPerDay: number;
  aiPerHour: number;
  exportsPerDay: number;
  exportsPerHour: number;
  insightReadsPerDay: number;
  insightReadsPerHour: number;
};

export const PLAN_LIMITS: Record<PlanKey, PlanLimit> = {
  free:       { aiPerDay: 2,    aiPerHour: 2,   exportsPerDay: 1,    exportsPerHour: 1,   insightReadsPerDay: 3,    insightReadsPerHour: 3 },
  trialing:   { aiPerDay: 5,    aiPerHour: 3,   exportsPerDay: 3,    exportsPerHour: 2,   insightReadsPerDay: 10,   insightReadsPerHour: 5 },
  starter:    { aiPerDay: 20,   aiPerHour: 8,   exportsPerDay: 20,   exportsPerHour: 8,   insightReadsPerDay: 50,   insightReadsPerHour: 20 },
  pro:        { aiPerDay: 100,  aiPerHour: 30,  exportsPerDay: 100,  exportsPerHour: 30,  insightReadsPerDay: 200,  insightReadsPerHour: 60 },
  enterprise: { aiPerDay: 9999, aiPerHour: 0,   exportsPerDay: 9999, exportsPerHour: 0,   insightReadsPerDay: 9999, insightReadsPerHour: 0 },
  lifetime:   { aiPerDay: 9999, aiPerHour: 0,   exportsPerDay: 9999, exportsPerHour: 0,   insightReadsPerDay: 9999, insightReadsPerHour: 0 },
};

/**
 * Per-export ROW caps. Stops a free/trial user from dumping the full database
 * in their one allowed export. 0 = unlimited.
 */
export const EXPORT_ROW_CAPS: Record<PlanKey, number> = {
  free:       25,
  trialing:   100,
  starter:    1000,
  pro:        10000,
  enterprise: 0,
  lifetime:   0,
};

export function getExportRowCap(plan: PlanKey): number {
  return EXPORT_ROW_CAPS[plan] ?? 25;
}

/** Numeric rank for plan comparison (mirrors _shared/billing.ts). */
export const PLAN_RANK: Record<PlanKey, number> = {
  free:       0,
  trialing:   1,
  starter:    2,
  pro:        3,
  enterprise: 4,
  lifetime:   4,
};

/** Returns true when current plan meets or exceeds minPlan. */
export function planMeetsMinimum(current: PlanKey, min: PlanKey): boolean {
  return PLAN_RANK[current] >= PLAN_RANK[min];
}

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
