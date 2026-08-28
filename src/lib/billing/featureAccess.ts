/**
 * Feature gating catalog.
 *
 * Deliberately small. AI calls, exports and insight reads are already metered
 * per plan by PLAN_LIMITS and enforced server-side, so most capability is
 * bounded by VOLUME rather than locked behind a plan. Only features with a
 * real marginal cost per use are hard-gated here.
 *
 * Nine gates used to sit on top of those volume limits - pipeline view,
 * compare, tender calendar, country and stakeholder intelligence, tender
 * intelligence, alert rules, saved searches. They were views of the same
 * project table, so a new user met a wall of locked doors before ever seeing
 * the data the product is judged on. They are now open and volume-limited.
 *
 * Before adding a key here, ask whether a quota in PLAN_LIMITS would do the
 * job instead. It usually will.
 *
 * Staff (admin/researcher) and lifetime grant holders bypass all gates via
 * `useEntitlements().staffBypass` / `plan === 'lifetime'`.
 */
import { PLAN_RANK, planMeetsMinimum, type PlanKey } from './limits';

export type FeatureKey =
  | 'portfolio_chat'
  | 'intelligence_summaries';

export const FEATURE_MIN_PLAN: Record<FeatureKey, PlanKey> = {
  portfolio_chat: 'starter',
  intelligence_summaries: 'starter',
};

export const FEATURE_LABELS: Record<FeatureKey, { name: string; description: string }> = {
  portfolio_chat: {
    name: 'Portfolio Chat',
    description: 'Ask AI questions about your tracked projects in natural language.',
  },
  intelligence_summaries: {
    name: 'AI digests and reports',
    description: 'AI-generated market digests, sector summaries, and exportable PDF reports.',
  },
};

export function canAccessFeature(
  plan: PlanKey,
  feature: FeatureKey,
  staffBypass: boolean,
): boolean {
  if (staffBypass) return true;
  return planMeetsMinimum(plan, FEATURE_MIN_PLAN[feature]);
}
