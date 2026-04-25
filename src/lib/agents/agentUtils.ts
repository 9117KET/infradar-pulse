/**
 * Pure utility functions for the Agent Monitoring dashboard.
 * Kept dependency-free so they can be unit-tested with Vitest without
 * mocking Supabase or React.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskRow {
  id: string;
  task_type: string;
  status: string;
  query: string;
  error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  current_step: string | null;
}

export interface AgentStats {
  completed: number;
  failed: number;
  running: number;
  total: number;
  successRate: number | null;
  lastRun: TaskRow | undefined;
  lastError: string | null;
}

export interface CoverageMetric {
  label: string;
  count: number;
  total: number;
  pct: number;
}

export interface DayActivity {
  date: string;
  completed: number;
  failed: number;
  running: number;
}

export interface ProjectCoverageRow {
  id: string;
  source_url: string | null;
  description: string | null;
  detailed_analysis: string | null;
  key_risks: string | null;
  funding_sources: string | null;
  environmental_impact: string | null;
  political_context: string | null;
}

// ── timeAgo ───────────────────────────────────────────────────────────────────

/**
 * Human-readable elapsed time from a UTC date string to now.
 * Buckets: "Just now" < 1 min < 60 min → "Xm ago" < 24h → "Xh ago" → "Xd ago"
 */
export function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── computeAgentStats ─────────────────────────────────────────────────────────

/**
 * Derives completed / failed / running counts, success rate, last run, and
 * last error from a flat task list filtered by task_type.
 *
 * Tasks are assumed to be ordered by created_at DESC (most-recent first),
 * which is how the monitoring query fetches them.
 */
export function computeAgentStats(tasks: TaskRow[], taskType: string): AgentStats {
  const agentTasks = tasks.filter(t => t.task_type === taskType);
  const completed = agentTasks.filter(t => t.status === 'completed').length;
  const failed = agentTasks.filter(t => t.status === 'failed').length;
  const running = agentTasks.filter(t => t.status === 'running').length;
  const total = completed + failed;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : null;
  const lastRun = agentTasks[0];

  // Surface the most recent error so the card can show it without requiring
  // the user to dig into the log stream.
  const lastFailedTask = agentTasks.find(t => t.status === 'failed' && t.error);
  const lastError = lastFailedTask?.error ?? null;

  return { completed, failed, running, total, successRate, lastRun, lastError };
}

// ── isAgentStale ──────────────────────────────────────────────────────────────

/**
 * An agent is stale if it has never run OR its last run was more than
 * 2× its scheduled interval ago.
 *
 * @param lastRunDate  ISO timestamp of the most-recent task (or undefined)
 * @param scheduleMinutes  Expected run interval in minutes
 */
export function isAgentStale(
  lastRunDate: string | undefined,
  scheduleMinutes: number,
): boolean {
  if (!lastRunDate) return true;
  const minutesSince = (Date.now() - new Date(lastRunDate).getTime()) / 60_000;
  return minutesSince > scheduleMinutes * 2;
}

// ── computeDataCoverage ───────────────────────────────────────────────────────

/**
 * Computes per-field fill rates across the project portfolio.
 * A field is considered "filled" when it is a non-empty string.
 * Contacts / Evidence coverage is derived from the pre-aggregated count maps.
 */
export function computeDataCoverage(
  projects: ProjectCoverageRow[],
  contactCounts: Record<string, number>,
  evidenceCounts: Record<string, number>,
): CoverageMetric[] {
  if (!projects.length) return [];
  const total = projects.length;

  const filled = (val: string | null | undefined) =>
    typeof val === 'string' && val.trim().length > 0;

  const metrics: { label: string; count: number }[] = [
    { label: 'Source URL',  count: projects.filter(p => filled(p.source_url)).length },
    { label: 'Description', count: projects.filter(p => filled(p.description)).length },
    { label: 'Analysis',    count: projects.filter(p => filled(p.detailed_analysis)).length },
    { label: 'Key Risks',   count: projects.filter(p => filled(p.key_risks)).length },
    { label: 'Funding',     count: projects.filter(p => filled(p.funding_sources)).length },
    { label: 'Environment', count: projects.filter(p => filled(p.environmental_impact)).length },
    { label: 'Political',   count: projects.filter(p => filled(p.political_context)).length },
    { label: 'Contacts',    count: projects.filter(p => (contactCounts[p.id] ?? 0) > 0).length },
    { label: 'Evidence',    count: projects.filter(p => (evidenceCounts[p.id] ?? 0) > 0).length },
  ];

  return metrics.map(m => ({
    ...m,
    total,
    pct: Math.round((m.count / total) * 100),
  }));
}

// ── computeActivityTimeline ───────────────────────────────────────────────────

/**
 * Buckets tasks into per-day completed / failed / running counts for the last
 * N days (default 7). Days are ordered oldest-first (left = oldest).
 */
export function computeActivityTimeline(
  tasks: TaskRow[],
  days = 7,
): DayActivity[] {
  const now = Date.now();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now - (days - 1 - i) * 86_400_000);
    const label = d.toLocaleDateString('en', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(d); dayEnd.setHours(23, 59, 59, 999);
    const dayTasks = tasks.filter(t => {
      const ct = new Date(t.created_at).getTime();
      return ct >= dayStart.getTime() && ct <= dayEnd.getTime();
    });
    return {
      date:      label,
      completed: dayTasks.filter(t => t.status === 'completed').length,
      failed:    dayTasks.filter(t => t.status === 'failed').length,
      running:   dayTasks.filter(t => t.status === 'running').length,
    };
  });
}
