/**
 * Read row caps for list endpoints (Projects, Insights).
 *
 * Mirrors EXPORT_ROW_CAPS so a free user can't sidestep the export quota by
 * scraping the dashboard UI: they see the same row count whether they export
 * once or paginate the list. Staff bypass returns 0 (= no cap).
 */
import { EXPORT_ROW_CAPS, PlanKey } from './limits';

/** Per-plan row cap for read/list endpoints. 0 = unlimited. */
export const READ_ROW_CAPS: Record<PlanKey, number> = EXPORT_ROW_CAPS;

export function getReadRowCap(plan: PlanKey, staffBypass: boolean): number {
  if (staffBypass) return 0;
  return READ_ROW_CAPS[plan] ?? 25;
}
