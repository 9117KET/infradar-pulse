/**
 * Feature gating catalog. Maps each premium feature to the minimum plan that
 * unlocks it. Mirrors the promises on /pricing so a free user can't bypass
 * limits by navigating the UI directly.
 *
 * Staff (admin/researcher) and lifetime grant holders bypass all gates via
 * `useEntitlements().staffBypass` / `plan === 'lifetime'`.
 */
import type { PlanKey } from './limits';

export type FeatureKey =
  // Starter+
  | 'alert_rules'
  | 'saved_searches'
  | 'portfolio_chat'
  | 'tender_calendar'
  | 'compare_projects'
  | 'pipeline_view'
  // Pro+
  | 'risk_signals'
  | 'realtime_monitoring'
  | 'tender_intelligence'
  | 'stakeholder_intel'
  | 'country_intelligence';

const PLAN_RANK: Record<PlanKey, number> = {
  free: 0,
  trialing: 1,
  starter: 2,
  lifetime: 3,
  pro: 3,
  enterprise: 4,
};

export const FEATURE_MIN_PLAN: Record<FeatureKey, PlanKey> = {
  // Starter (and above)
  alert_rules: 'starter',
  saved_searches: 'starter',
  portfolio_chat: 'starter',
  tender_calendar: 'starter',
  compare_projects: 'starter',
  pipeline_view: 'starter',
  // Pro (and above)
  risk_signals: 'pro',
  realtime_monitoring: 'pro',
  tender_intelligence: 'pro',
  stakeholder_intel: 'pro',
  country_intelligence: 'pro',
};

export const FEATURE_LABELS: Record<FeatureKey, { name: string; description: string }> = {
  alert_rules: {
    name: 'Custom alert rules',
    description: 'Create unlimited alert rules with custom filters, severity, and email delivery.',
  },
  saved_searches: {
    name: 'Saved searches',
    description: 'Save filter combinations and get notified when new matches appear.',
  },
  portfolio_chat: {
    name: 'Portfolio Chat',
    description: 'Ask AI questions about your tracked projects in natural language.',
  },
  tender_calendar: {
    name: 'Tender Calendar',
    description: 'See every milestone and tender deadline in one calendar view.',
  },
  compare_projects: {
    name: 'Compare projects',
    description: 'Side-by-side comparison of up to 5 projects on risk, value, and stage.',
  },
  pipeline_view: {
    name: 'Pipeline view',
    description: 'Kanban view of every project across all lifecycle stages.',
  },
  risk_signals: {
    name: 'Risk & anomaly signals',
    description: 'Delay risk scores, anomaly detection, and early warning alerts.',
  },
  realtime_monitoring: {
    name: 'Real-time monitoring',
    description: 'Live project updates, agent activity, and intelligence stream.',
  },
  tender_intelligence: {
    name: 'Tender intelligence',
    description: 'Contract awards, cancellations, and tender events feed.',
  },
  stakeholder_intel: {
    name: 'Stakeholder intelligence',
    description: 'Contractor, sponsor, and stakeholder networks across projects.',
  },
  country_intelligence: {
    name: 'Country intelligence',
    description: 'Country-by-country project portfolios, risk profiles, and pipelines.',
  },
};

export function planMeetsRequirement(plan: PlanKey, required: PlanKey): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[required];
}

export function canAccessFeature(
  plan: PlanKey,
  feature: FeatureKey,
  staffBypass: boolean,
): boolean {
  if (staffBypass) return true;
  return planMeetsRequirement(plan, FEATURE_MIN_PLAN[feature]);
}
