// Human plan key -> Lemon Squeezy variant ID, resolved once at cold start.
// This is the LS equivalent of the hardcoded PRICE_TO_PLAN map in
// payments-webhook/index.ts: the one place to update when the user creates
// real variants in their Lemon Squeezy dashboard. Trials are disabled for all
// sold plans in this app (see usePaddleCheckout.ts), so unlike Paddle there
// is no separate "_no_trial" variant per plan/cycle.
export type LsPlanKey =
  | 'starter_monthly'
  | 'starter_yearly'
  | 'pro_monthly'
  | 'pro_yearly'
  | 'lifetime_pro_onetime';

const PLAN_TO_VARIANT: Record<LsPlanKey, string | undefined> = {
  starter_monthly: Deno.env.get('LEMONSQUEEZY_VARIANT_STARTER_MONTHLY'),
  starter_yearly: Deno.env.get('LEMONSQUEEZY_VARIANT_STARTER_YEARLY'),
  pro_monthly: Deno.env.get('LEMONSQUEEZY_VARIANT_PRO_MONTHLY'),
  pro_yearly: Deno.env.get('LEMONSQUEEZY_VARIANT_PRO_YEARLY'),
  lifetime_pro_onetime: Deno.env.get('LEMONSQUEEZY_VARIANT_LIFETIME_PRO_ONETIME'),
};

// Reverse map (variant ID -> plan_key), used by the webhook to classify
// incoming events without a second round of env lookups.
const VARIANT_TO_PLAN: Record<string, string> = {};
for (const [planKey, variantId] of Object.entries(PLAN_TO_VARIANT)) {
  if (variantId) {
    VARIANT_TO_PLAN[variantId] = planKey.startsWith('lifetime') ? 'lifetime' : planKey.split('_')[0];
  }
}

export function getVariantId(planKey: LsPlanKey): string {
  const variantId = PLAN_TO_VARIANT[planKey];
  if (!variantId) throw new Error(`No Lemon Squeezy variant configured for plan "${planKey}"`);
  return variantId;
}

export function variantIdToPlanKey(variantId: string | undefined): string {
  if (variantId && VARIANT_TO_PLAN[variantId]) return VARIANT_TO_PLAN[variantId];
  console.warn('lemonsqueezy: unknown variant_id, defaulting to starter:', variantId);
  return 'starter';
}

export function isLifetimeVariant(variantId: string | undefined): boolean {
  return !!variantId && variantId === PLAN_TO_VARIANT.lifetime_pro_onetime;
}
