/**
 * Canonical limits (UTC daily buckets). Keep in sync with src/lib/billing/limits.ts.
 * Staff roles admin/researcher bypass in entitlementCheck.ts.
 */
export type PlanKey = "free" | "trialing" | "starter" | "pro" | "enterprise" | "lifetime";

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

export function resolvePlanKeyFromPriceId(priceId: string | null | undefined): PlanKey {
  const starter = Deno.env.get("STRIPE_PRICE_STARTER");
  const pro = Deno.env.get("STRIPE_PRICE_PRO");
  const enterprise = Deno.env.get("STRIPE_PRICE_ENTERPRISE");
  if (!priceId) return "starter";
  if (priceId === starter) return "starter";
  if (priceId === pro) return "pro";
  if (priceId === enterprise) return "enterprise";
  return "starter";
}
