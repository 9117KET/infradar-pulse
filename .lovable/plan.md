## Goal
Finalize the agent pipeline so scheduled runs stop being blocked by stale "running" locks, surface real failures cleanly, and give staff a one-click way to recover stuck agents.

## Current state (from live DB inspection)

Agents are mostly working. Recent runs (after Apr 28 06:36) succeed for `regulatory-monitor`, `stakeholder-intel`, `supply-chain-monitor`, `security-resilience`, etc. All agent code is now Lovable-AI-only (no direct Perplexity calls remain in agent files). Older "Perplexity 401" errors are historical, from before the `agentResearch.ts` wrapper was switched.

The remaining real problems:

**1. Stale locks block scheduled runs.** 7 tasks are stuck in `running`, some 1–3 days old:

```text
contact-finder      4 rows  oldest 2026-04-27 12:00
data-enrichment     1 row   2026-04-28 19:48
dataset-refresh     1 row   2026-04-27 14:05
digest-agent        1 row   2026-04-27 12:03
iadb-ingest         1 row   2026-04-28 06:35
report-agent        1 row   2026-04-27 12:11
update-check        1 row   2026-04-28 19:48
```

`begin_agent_task` treats any `status='running'` row as an active lock, so cron silently skips these agents forever (they return `alreadyRunning: true`).

**2. No timeout on the lock.** If an Edge Function crashes, times out, or the runtime kills it before `finishAgentRun`, the row stays `running` permanently.

**3. `agent_config.last_run_status` shows `running`** for `contact-finder`, `dataset-refresh`, `digest-agent`, `report-agent` because nothing ever finalized them. The Agent Monitoring UI then renders them as perpetually "Running" instead of "Stale/Error".

**4. Some agents never call `finishAgentRun`** on the failure path (or on the early-exit path), so even when they fail cleanly the config stats don't update.

## Plan

### 1. Database: timeout-aware lock + cleanup (migration)

Update `begin_agent_task` to treat any `running` row older than a timeout (30 min default, 6 h for long ingests) as stale, mark it `failed`, and proceed:

```text
WITH stale AS (
  UPDATE research_tasks
  SET status='failed',
      error = COALESCE(error,'')||' [auto-expired stale lock]',
      completed_at = now()
  WHERE task_type = p_task_type
    AND status='running'
    AND created_at < now() - (
      CASE WHEN p_task_type LIKE '%-ingest' THEN interval '6 hours'
           ELSE interval '30 minutes' END)
  RETURNING 1
)
-- then re-check running count, insert new row if 0
```

One-shot cleanup at the end of the migration: expire all currently-stuck rows (>30 min for non-ingest, >6 h for ingest) and call `rebuild_agent_config_from_tasks()` so the config dashboard reflects reality.

### 2. Agent lifecycle hardening (edge functions)

Audit and patch these agents to ensure every code path (success, business-failure, thrown exception, early return) calls `finishAgentRun` and writes a final `research_tasks` status:

- `contact-finder`
- `digest-agent`
- `report-agent`
- `dataset-refresh-agent`
- `iadb-ingest-agent`
- `update-checker`
- `data-enrichment`

Pattern to enforce in each:

```text
const runStartedAt = new Date();
try {
  ...work...
  await supabase.from('research_tasks').update({status:'completed',...}).eq('id', taskId);
  await finishAgentRun(supabase,'<agent>','completed',runStartedAt);
} catch (e) {
  await supabase.from('research_tasks').update({status:'failed', error:String(e), completed_at:new Date().toISOString()}).eq('id', taskId);
  await finishAgentRun(supabase,'<agent>','failed',runStartedAt);
  throw e;
}
```

### 3. Manual recovery in Agent Monitoring UI

Add a "Reset stuck task" action on each row in `src/pages/dashboard/AgentMonitoring.tsx` that calls a new admin RPC `reset_stuck_agent_task(p_agent_type)` to mark its `running` row(s) as failed immediately. Useful when staff want to recover without waiting for the timeout.

### 4. Verify with a smoke run

After deploy, manually invoke each previously-stuck agent from the Agent Monitoring page and confirm:
- task transitions running → completed/failed
- `agent_config.last_run_status` updates to a terminal status
- next cron tick is no longer skipped

## Files to change

- `supabase/migrations/<new>_agent_lock_timeout.sql` — new `begin_agent_task`, cleanup, `reset_stuck_agent_task` RPC, rebuild config
- `supabase/functions/contact-finder/index.ts`
- `supabase/functions/digest-agent/index.ts`
- `supabase/functions/report-agent/index.ts`
- `supabase/functions/dataset-refresh-agent/index.ts`
- `supabase/functions/iadb-ingest-agent/index.ts`
- `supabase/functions/update-checker/index.ts`
- `supabase/functions/data-enrichment/index.ts`
- `src/pages/dashboard/AgentMonitoring.tsx` — Reset action button + handler

## Out of scope

- Removing the legacy Perplexity / Firecrawl error strings from old historical rows (cosmetic only; new runs no longer hit these paths).
- Adding new agents or changing schedules.