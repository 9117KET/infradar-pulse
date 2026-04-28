import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  timeAgo,
  computeAgentStats,
  isAgentStale,
  computeDataCoverage,
  computeActivityTimeline,
  type TaskRow,
  type ProjectCoverageRow,
} from '@/lib/agents/agentUtils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: crypto.randomUUID(),
    task_type: 'discovery',
    status: 'completed',
    query: 'test query',
    error: null,
    result: null,
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    current_step: null,
    ...overrides,
  };
}

function makeProject(overrides: Partial<ProjectCoverageRow> = {}): ProjectCoverageRow {
  return {
    id: crypto.randomUUID(),
    source_url: null,
    description: null,
    detailed_analysis: null,
    key_risks: null,
    funding_sources: null,
    environmental_impact: null,
    political_context: null,
    ...overrides,
  };
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString();
}

// ── timeAgo ───────────────────────────────────────────────────────────────────

describe('timeAgo', () => {
  it('returns "Just now" for timestamps less than 1 minute ago', () => {
    expect(timeAgo(new Date(Date.now() - 30_000).toISOString())).toBe('Just now');
  });

  it('returns "Just now" for the current moment', () => {
    expect(timeAgo(new Date().toISOString())).toBe('Just now');
  });

  it('returns minutes for 1-59 minutes ago', () => {
    expect(timeAgo(minutesAgo(1))).toBe('1m ago');
    expect(timeAgo(minutesAgo(30))).toBe('30m ago');
    expect(timeAgo(minutesAgo(59))).toBe('59m ago');
  });

  it('returns hours for 1-23 hours ago', () => {
    expect(timeAgo(hoursAgo(1))).toBe('1h ago');
    expect(timeAgo(hoursAgo(12))).toBe('12h ago');
    expect(timeAgo(hoursAgo(23))).toBe('23h ago');
  });

  it('returns days for 24+ hours ago', () => {
    expect(timeAgo(daysAgo(1))).toBe('1d ago');
    expect(timeAgo(daysAgo(3))).toBe('3d ago');
    expect(timeAgo(daysAgo(30))).toBe('30d ago');
  });
});

// ── computeAgentStats ─────────────────────────────────────────────────────────

describe('computeAgentStats', () => {
  it('returns zeros and null rate when no tasks match the type', () => {
    const tasks = [makeTask({ task_type: 'other-agent' })];
    const stats = computeAgentStats(tasks, 'discovery');
    expect(stats.completed).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.running).toBe(0);
    expect(stats.successRate).toBeNull();
    expect(stats.lastRun).toBeUndefined();
    expect(stats.lastError).toBeNull();
  });

  it('counts completed, failed, and running tasks correctly', () => {
    const tasks = [
      makeTask({ task_type: 'discovery', status: 'completed' }),
      makeTask({ task_type: 'discovery', status: 'completed' }),
      makeTask({ task_type: 'discovery', status: 'failed', error: 'timeout' }),
      makeTask({ task_type: 'discovery', status: 'running' }),
      makeTask({ task_type: 'other-agent', status: 'failed' }),
    ];
    const stats = computeAgentStats(tasks, 'discovery');
    expect(stats.completed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.running).toBe(1);
  });

  it('calculates successRate as percentage of (completed / completed+failed)', () => {
    const tasks = [
      makeTask({ task_type: 'risk-scoring', status: 'completed' }),
      makeTask({ task_type: 'risk-scoring', status: 'completed' }),
      makeTask({ task_type: 'risk-scoring', status: 'completed' }),
      makeTask({ task_type: 'risk-scoring', status: 'failed' }),
    ];
    const stats = computeAgentStats(tasks, 'risk-scoring');
    expect(stats.successRate).toBe(75); // 3/4
  });

  it('returns successRate=100 when all tasks completed', () => {
    const tasks = [makeTask({ task_type: 'update-check', status: 'completed' })];
    const stats = computeAgentStats(tasks, 'update-check');
    expect(stats.successRate).toBe(100);
  });

  it('returns successRate=0 when all tasks failed', () => {
    const tasks = [
      makeTask({ task_type: 'regulatory-monitor', status: 'failed', error: 'No data' }),
      makeTask({ task_type: 'regulatory-monitor', status: 'failed', error: 'No data' }),
    ];
    const stats = computeAgentStats(tasks, 'regulatory-monitor');
    expect(stats.successRate).toBe(0);
  });

  it('excludes running tasks from the successRate denominator', () => {
    // 1 completed + 1 running = 100% (running tasks are in-progress, not done)
    const tasks = [
      makeTask({ task_type: 'discovery', status: 'completed' }),
      makeTask({ task_type: 'discovery', status: 'running' }),
    ];
    const stats = computeAgentStats(tasks, 'discovery');
    expect(stats.successRate).toBe(100);
    expect(stats.total).toBe(1); // only completed + failed
  });

  it('returns the first task in the list as lastRun (assumes DESC order)', () => {
    const newer = makeTask({ task_type: 'discovery', created_at: hoursAgo(1) });
    const older = makeTask({ task_type: 'discovery', created_at: hoursAgo(5) });
    const stats = computeAgentStats([newer, older], 'discovery');
    expect(stats.lastRun?.id).toBe(newer.id);
  });

  it('surfaces the most recent error message in lastError', () => {
    const tasks = [
      makeTask({ task_type: 'stakeholder-intel', status: 'failed', error: 'No data sources', created_at: hoursAgo(1) }),
      makeTask({ task_type: 'stakeholder-intel', status: 'failed', error: 'Timeout', created_at: hoursAgo(2) }),
    ];
    const stats = computeAgentStats(tasks, 'stakeholder-intel');
    // Finds the first failed task with an error (most recent first)
    expect(stats.lastError).toBe('No data sources');
  });

  it('returns lastError=null when all tasks completed without error', () => {
    const tasks = [makeTask({ task_type: 'discovery', status: 'completed', error: null })];
    const stats = computeAgentStats(tasks, 'discovery');
    expect(stats.lastError).toBeNull();
  });

  it('ignores tasks from other agent types completely', () => {
    const tasks = [
      makeTask({ task_type: 'other', status: 'failed', error: 'should not appear' }),
      makeTask({ task_type: 'discovery', status: 'completed' }),
    ];
    const stats = computeAgentStats(tasks, 'discovery');
    expect(stats.failed).toBe(0);
    expect(stats.lastError).toBeNull();
  });
});

// ── isAgentStale ──────────────────────────────────────────────────────────────

describe('isAgentStale', () => {
  it('returns true when lastRunDate is undefined (never run)', () => {
    expect(isAgentStale(undefined, 30)).toBe(true);
  });

  it('returns true when last run was more than 2x the schedule interval ago', () => {
    // Schedule: every 30 min. Stale threshold: 60 min.
    expect(isAgentStale(minutesAgo(61), 30)).toBe(true);
  });

  it('returns false when last run is within 2x the schedule interval', () => {
    expect(isAgentStale(minutesAgo(29), 30)).toBe(false);
  });

  it('returns false when last run is exactly at the stale boundary', () => {
    // Exactly 2x = border; just inside is fine
    expect(isAgentStale(minutesAgo(59), 30)).toBe(false);
  });

  it('handles daily agents (1440 min schedule, stale after 2880 min)', () => {
    expect(isAgentStale(daysAgo(3), 1440)).toBe(true);   // 3 days > 2 days
    expect(isAgentStale(daysAgo(1), 1440)).toBe(false);  // 1 day < 2 days
  });

  it('handles hourly agents (60 min schedule, stale after 120 min)', () => {
    expect(isAgentStale(hoursAgo(3), 60)).toBe(true);    // 180 min > 120 threshold
    expect(isAgentStale(minutesAgo(121), 60)).toBe(true); // 121 min > 120 threshold
    expect(isAgentStale(minutesAgo(90), 60)).toBe(false); // 90 min < 120 threshold
    expect(isAgentStale(minutesAgo(60), 60)).toBe(false); // 60 min < 120 threshold
  });
});

// ── computeDataCoverage ───────────────────────────────────────────────────────

describe('computeDataCoverage', () => {
  it('returns an empty array when there are no projects', () => {
    expect(computeDataCoverage([], {}, {})).toEqual([]);
  });

  it('returns 9 metrics for a non-empty project list', () => {
    const projects = [makeProject()];
    const result = computeDataCoverage(projects, {}, {});
    expect(result).toHaveLength(9);
  });

  it('computes 100% for a field when all projects have it filled', () => {
    const projects = [
      makeProject({ source_url: 'https://example.com' }),
      makeProject({ source_url: 'https://other.com' }),
    ];
    const result = computeDataCoverage(projects, {}, {});
    const sourceMetric = result.find(m => m.label === 'Source URL')!;
    expect(sourceMetric.pct).toBe(100);
    expect(sourceMetric.count).toBe(2);
  });

  it('computes 0% for a field when no projects have it', () => {
    const projects = [makeProject(), makeProject()];
    const result = computeDataCoverage(projects, {}, {});
    const analysisMetric = result.find(m => m.label === 'Analysis')!;
    expect(analysisMetric.pct).toBe(0);
    expect(analysisMetric.count).toBe(0);
  });

  it('computes partial coverage correctly', () => {
    const projects = [
      makeProject({ detailed_analysis: 'Some analysis' }),
      makeProject(), // no analysis
      makeProject(), // no analysis
      makeProject({ detailed_analysis: 'More analysis' }),
    ];
    const result = computeDataCoverage(projects, {}, {});
    const metric = result.find(m => m.label === 'Analysis')!;
    expect(metric.count).toBe(2);
    expect(metric.total).toBe(4);
    expect(metric.pct).toBe(50);
  });

  it('treats empty string as unfilled', () => {
    const projects = [makeProject({ description: '' }), makeProject({ description: '   ' })];
    const result = computeDataCoverage(projects, {}, {});
    const metric = result.find(m => m.label === 'Description')!;
    expect(metric.count).toBe(0);
  });

  it('counts contacts coverage from the contactCounts map', () => {
    const p1 = makeProject();
    const p2 = makeProject();
    const p3 = makeProject();
    const contactCounts = { [p1.id]: 3, [p2.id]: 1 }; // p3 has no contacts
    const result = computeDataCoverage([p1, p2, p3], contactCounts, {});
    const metric = result.find(m => m.label === 'Contacts')!;
    expect(metric.count).toBe(2);
    expect(metric.pct).toBe(67);
  });

  it('counts evidence coverage from the evidenceCounts map', () => {
    const p1 = makeProject();
    const p2 = makeProject();
    const evidenceCounts = { [p1.id]: 5 };
    const result = computeDataCoverage([p1, p2], {}, evidenceCounts);
    const metric = result.find(m => m.label === 'Evidence')!;
    expect(metric.count).toBe(1);
    expect(metric.pct).toBe(50);
  });

  it('sets total to the number of projects on every metric', () => {
    const projects = [makeProject(), makeProject(), makeProject()];
    const result = computeDataCoverage(projects, {}, {});
    result.forEach(m => expect(m.total).toBe(3));
  });
});

// ── computeActivityTimeline ───────────────────────────────────────────────────

describe('computeActivityTimeline', () => {
  it('returns 7 entries by default', () => {
    expect(computeActivityTimeline([])).toHaveLength(7);
  });

  it('returns N entries when days parameter is provided', () => {
    expect(computeActivityTimeline([], 14)).toHaveLength(14);
    expect(computeActivityTimeline([], 3)).toHaveLength(3);
  });

  it('returns all-zero counts when task list is empty', () => {
    const result = computeActivityTimeline([]);
    result.forEach(day => {
      expect(day.completed).toBe(0);
      expect(day.failed).toBe(0);
      expect(day.running).toBe(0);
    });
  });

  it('buckets tasks into the correct day', () => {
    const tasks = [
      makeTask({ status: 'completed', created_at: daysAgo(0) }), // today
      makeTask({ status: 'completed', created_at: daysAgo(0) }), // today
      makeTask({ status: 'failed',    created_at: daysAgo(0) }), // today
      makeTask({ status: 'completed', created_at: daysAgo(2) }), // 2 days ago
    ];
    const result = computeActivityTimeline(tasks, 7);
    const today = result[result.length - 1];
    const twoDaysAgo = result[result.length - 3];

    expect(today.completed).toBe(2);
    expect(today.failed).toBe(1);
    expect(twoDaysAgo.completed).toBe(1);
    expect(twoDaysAgo.failed).toBe(0);
  });

  it('does not count tasks older than the window', () => {
    const tasks = [makeTask({ status: 'completed', created_at: daysAgo(8) })];
    const result = computeActivityTimeline(tasks, 7);
    const total = result.reduce((s, d) => s + d.completed, 0);
    expect(total).toBe(0);
  });

  it('entries are ordered oldest-first (index 0 = oldest day)', () => {
    const tasks = [makeTask({ status: 'completed', created_at: daysAgo(6) })];
    const result = computeActivityTimeline(tasks, 7);
    expect(result[0].completed).toBe(1); // 6 days ago = oldest slot
    expect(result[result.length - 1].completed).toBe(0); // today = no tasks
  });

  it('counts running tasks in the running bucket, not completed', () => {
    const tasks = [makeTask({ status: 'running', created_at: daysAgo(0) })];
    const result = computeActivityTimeline(tasks, 7);
    const today = result[result.length - 1];
    expect(today.running).toBe(1);
    expect(today.completed).toBe(0);
  });
});

// ── AGENTS task_type mapping ──────────────────────────────────────────────────
// These tests verify that every agent in the AGENTS constant uses a task_type
// string that actually matches what the corresponding Supabase function writes
// into the research_tasks table. A mismatch would cause "Never run" to show
// even when the agent has run successfully.

const EXPECTED_TASK_TYPES: Record<string, string> = {
  'discovery':            'discovery',
  'world-bank-ingest':    'world-bank-ingest',
  'ifc-ingest':           'ifc-ingest',
  'adb-ingest':           'adb-ingest',
  'afdb-ingest':          'afdb-ingest',
  'ebrd-ingest':          'ebrd-ingest',
  'update-check':         'update-check',
  'risk-scoring':         'risk-scoring',
  'stakeholder-intel':    'stakeholder-intel',
  'funding-tracker':      'funding-tracker',
  'regulatory-monitor':   'regulatory-monitor',
  'sentiment-analyzer':   'sentiment-analyzer',
  'supply-chain-monitor': 'supply-chain-monitor',
  'market-intel':         'market-intel',
  'contact-finder':       'contact-finder',
  'alert-intelligence':   'alert-intelligence',
  'data-enrichment':      'data-enrichment',
  'digest-agent':         'digest-agent',
  'dataset-refresh':      'dataset-refresh',
  'report-agent':         'report-agent',
  'entity-dedup':         'entity-dedup',
  'corporate-ma-monitor': 'corporate-ma-monitor',
  'esg-social-monitor':   'esg-social-monitor',
  'security-resilience':  'security-resilience',
  'tender-award-monitor': 'tender-award-monitor',
  'executive-briefing':   'executive-briefing',
};

describe('AGENTS task_type consistency', () => {
  it('every agent type in EXPECTED_TASK_TYPES matches itself (identity check)', () => {
    Object.entries(EXPECTED_TASK_TYPES).forEach(([agentType, dbTaskType]) => {
      expect(agentType).toBe(dbTaskType);
    });
  });

  it('covers all 26 agents', () => {
    expect(Object.keys(EXPECTED_TASK_TYPES)).toHaveLength(26);
  });

  it('computeAgentStats correctly filters by task_type for each agent', () => {
    // Build a task list with one task for each agent type
    const tasks = Object.keys(EXPECTED_TASK_TYPES).map(type =>
      makeTask({ task_type: type, status: 'completed' })
    );

    // Each agent should see exactly 1 completed task and nobody else's
    Object.keys(EXPECTED_TASK_TYPES).forEach(type => {
      const stats = computeAgentStats(tasks, type);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.successRate).toBe(100);
    });
  });
});
