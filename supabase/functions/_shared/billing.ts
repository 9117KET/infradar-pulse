/**
 * Canonical limits (UTC daily + UTC hourly buckets). Keep in sync with
 * src/lib/billing/limits.ts. Staff roles admin/researcher bypass in
 * entitlementCheck.ts.
 *
 * The hourly cap is an anti-burst guard. It is intentionally lower than the
 * daily cap so a script can't drain the whole day's quota in one second.
 * Set to 0 to disable the hourly cap for a given metric/plan.
 */
export type PlanKey = "free" | "trialing" | "starter" | "pro" | "enterprise" | "lifetime";

export type PlanLimit = {
  aiPerDay: number;
  aiPerHour: number;
  exportsPerDay: number;
  exportsPerHour: number;
  insightReadsPerDay: number;
  insightReadsPerHour: number;
};

export const PLAN_LIMITS: Record<PlanKey, PlanLimit> = {
  // Free tier is for evaluation. Hourly caps == daily caps (already small).
  free:       { aiPerDay: 2,    aiPerHour: 2,   exportsPerDay: 1,    exportsPerHour: 1,   insightReadsPerDay: 3,    insightReadsPerHour: 3 },
  trialing:   { aiPerDay: 5,    aiPerHour: 3,   exportsPerDay: 3,    exportsPerHour: 2,   insightReadsPerDay: 10,   insightReadsPerHour: 5 },
  starter:    { aiPerDay: 20,   aiPerHour: 8,   exportsPerDay: 20,   exportsPerHour: 8,   insightReadsPerDay: 50,   insightReadsPerHour: 20 },
  pro:        { aiPerDay: 100,  aiPerHour: 30,  exportsPerDay: 100,  exportsPerHour: 30,  insightReadsPerDay: 200,  insightReadsPerHour: 60 },
  enterprise: { aiPerDay: 9999, aiPerHour: 0,   exportsPerDay: 9999, exportsPerHour: 0,   insightReadsPerDay: 9999, insightReadsPerHour: 0 },
  lifetime:   { aiPerDay: 9999, aiPerHour: 0,   exportsPerDay: 9999, exportsPerHour: 0,   insightReadsPerDay: 9999, insightReadsPerHour: 0 },
};

/**
 * Numeric rank used to compare plans. Staff bypass (admin/researcher) is
 * resolved before this is consulted, so enterprise rank is the effective
 * ceiling for all non-staff comparisons.
 */
export const PLAN_RANK: Record<PlanKey, number> = {
  free:       0,
  trialing:   1,
  starter:    2,
  pro:        3,
  enterprise: 4,
  lifetime:   4,
};

/** Returns true when the user's current plan meets or exceeds minPlan. */
export function planMeetsMinimum(current: PlanKey, min: PlanKey): boolean {
  return PLAN_RANK[current] >= PLAN_RANK[min];
}

/**
 * Per-export ROW caps (sync with src/lib/billing/limits.ts). Server reads
 * these to validate a row_count value reported by the client and reject
 * obviously over-cap requests as defense-in-depth.
 */
export const EXPORT_ROW_CAPS: Record<PlanKey, number> = {
  free:       25,
  trialing:   100,
  starter:    1000,
  pro:        10000,
  enterprise: 0,
  lifetime:   0,
};
