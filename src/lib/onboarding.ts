export const TOTAL_ONBOARDING_STEPS = 5;

export const PRESELECT_LIMIT = 5;

/** Resume point for the onboarding wizard. Tolerates missing column (prod migration lag) and stale out-of-range values. */
export function resolveResumeStep(profile: { onboarding_step?: number | null } | null | undefined): number {
  const step = profile?.onboarding_step ?? 0;
  return Math.min(Math.max(step, 0), TOTAL_ONBOARDING_STEPS - 1);
}

/**
 * Selection for the portfolio-seeding step.
 * - Projects the user already tracks always stay selected.
 * - Until the user manually toggles anything, the top `limit` suggestions are pre-selected (opt-out).
 * - Once touched, the user's current selection is preserved as-is.
 */
export function computePreselectedIds(
  suggested: { id: string }[],
  alreadyTracked: string[],
  userTouched: boolean,
  currentSelection: Set<string>,
  limit: number = PRESELECT_LIMIT,
): Set<string> {
  if (userTouched) return currentSelection;
  const suggestedIds = new Set(suggested.map(p => p.id));
  const tracked = alreadyTracked.filter(id => suggestedIds.has(id));
  if (tracked.length > 0) return new Set(tracked);
  return new Set(suggested.slice(0, limit).map(p => p.id));
}
