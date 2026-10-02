/**
 * Public list prices (USD). The single source for every price shown in the UI.
 *
 * The amount actually charged comes from the Lemon Squeezy variant behind each
 * plan key (supabase/functions/_shared/lemonsqueezyPlans.ts), so a change here
 * must be mirrored on those variants in the Lemon Squeezy dashboard.
 *
 * Positioned against the closest alternatives buyers already use (Oct 2026):
 * development-funding/tender databases at ~$250–$1,200 per user per year and
 * project databases from ~$350 per user per month.
 */
export const PRICES = {
  starter: { monthly: 19, yearly: 180 },
  pro: { monthly: 79, yearly: 756 },
  lifetime: 999,
} as const;

/** "$15.00" style per-month equivalent of a yearly price. */
export function perMonth(yearly: number): string {
  return `$${(yearly / 12).toFixed(2)}`;
}

/** Whole-percent saving of yearly billing vs paying monthly for 12 months. */
export function yearlySavingPct(plan: { monthly: number; yearly: number }): number {
  return Math.round((1 - plan.yearly / (plan.monthly * 12)) * 100);
}
