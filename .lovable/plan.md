## Audit results

I checked all 30+ scheduled agents (`research_tasks`, `agent_config`, function code, monitoring helpers). Most agents are healthy and completing on Lovable AI as designed. Three real problems plus some monitoring noise:

### 1. Scheduled cron has been silent for 9 days (highest-impact bug)

- Most recent row in `research_tasks` is **2026-05-03 09:07** — today is 2026-05-12.
- Every agent's `agent_config.last_run_at` is also stuck around May 3.
- This matches the known failure mode in `mem://architecture/agent-cron-auth`: pg_cron calls edge functions using the service-role JWT stored in `vault.secrets('email_queue_service_role_key')`. When that vault secret falls out of sync with the current `SUPABASE_SERVICE_ROLE_KEY`, every cron-driven HTTP call returns 401 and no `research_tasks` rows are ever created.
- The `agent-health-monitor` function exists to detect exactly this and email admins, but `agent_health_alerts` is empty — meaning the monitor itself is also not being invoked by cron (same root cause).

Fix: re-sync the vault secret by invoking the existing `sync-service-role-to-vault` edge function with admin auth, then verify `cron.job_run_details` start producing succeeded rows again. After that, `agent-health-monitor` will start writing/clearing alerts on its own. No code change needed for the resync itself; if the function or its admin trigger is missing pieces I'll add them.

### 2. `update-checker` and `data-enrichment` exceed the edge function wall clock

- Both are currently auto-reaped after 30 min on every run (`research_tasks.error = '[auto-reaped: stuck running >30m]'`).
- `update-checker` loops 50 projects × 2 sequential AI calls each (research + extraction).
- `data-enrichment` loops 15 projects × 2 sequential AI calls each, and is also missing the `isAgentEnabled` gate that every other agent has.
- Edge functions in Supabase have a hard ~150s wall-clock; the loops cannot finish, so the function is killed mid-iteration before it can write `status='completed'`.

Fix:
- Reduce per-run batch size: `update-checker` 50 → 8 projects, `data-enrichment` 15 → 6 projects (cron runs hourly so coverage is preserved within a day).
- Add `isAgentEnabled('data-enrichment')` + `pausedResponse` at the top of `data-enrichment` for parity with the rest.
- In both, wrap the per-project body in a wall-clock check (`if (Date.now() - runStartedAt > 110_000) break`) so they always exit cleanly and call `finishAgentRun(..., 'completed')` instead of being reaped.

### 3. Stale duplicate rows in `agent_config`

`agent_config` has both the old function-style key and the new task-type key for several agents:

| stale row (last run) | live row |
|---|---|
| `risk-scorer` (Apr 28) | `risk-scoring` |
| `update-checker` (Apr 30) | `update-check` |
| `research-agent` (Apr 30) | `discovery` |
| `insight-sources-agent` (Apr 30) | `insight-sources` |
| `world-bank-ingest-agent` (if present) | `world-bank-ingest` |

`rebuild_agent_config_from_tasks()` only inserts/updates from `research_tasks.task_type`, so the stale rows never go away and inflate the failure counts that show on `/dashboard/agents`.

Fix: one-shot migration that deletes the stale `agent_type` rows, then call `rebuild_agent_config_from_tasks()` so the dashboard reflects the real (good) success/failure history.

### 4. Two ingest agents are paused and need a deliberate decision

- `aiib-ingest` — `enabled=false`, never run. The function itself parses an official AIIB JS bootstrap and looks fine; just needs to be enabled (or explicitly left off if we don't want AIIB right now).
- `adb-ingest` — `enabled=false` after repeated "Could not locate ADB CSV dataset" failures. ADB changed its CSV endpoint. Either find the new CSV and update `directUrls` in `adb-ingest-agent`, or leave it disabled.

I'll flip `aiib-ingest` on. For `adb-ingest` I'd rather confirm with you before chasing the ADB endpoint change (it's not breaking anything in the disabled state).

### What I will NOT touch

- The historical "high failure count" agents (`regulatory-monitor`, `stakeholder-intel`, `supply-chain-monitor`, `corporate-ma-monitor`, etc.) — their old failures are pre-Apr-28 Perplexity-quota errors. They have all been completing successfully on Lovable AI since the migration. Once item 3 cleans up `agent_config`, the dashboard will look honest.
- Any of the working monitoring functions (`tender-award-monitor`, `security-resilience`, `esg-social-monitor`, `funding-tracker`, `market-intel`, `sentiment-analyzer`, `alert-intelligence`, `executive-briefing`, etc.) — code is correct.

## Plan of work

1. Resync service-role JWT into vault so cron can auth again, and verify a fresh `research_tasks` row appears within one cron tick.
2. Code changes:
   - `supabase/functions/update-checker/index.ts`: batch 50→8 + wall-clock break.
   - `supabase/functions/data-enrichment/index.ts`: batch 15→6 + wall-clock break + add `isAgentEnabled`/`pausedResponse`.
3. Migration: delete stale `agent_config` rows listed above, then `SELECT public.rebuild_agent_config_from_tasks();`. Also `UPDATE agent_config SET enabled=true WHERE agent_type='aiib-ingest';`.
4. Verify on `/dashboard/agents`: no duplicate rows, `update-check` and `data-enrichment` complete cleanly, AIIB starts producing rows on next cron tick.

## Question before I implement

For `adb-ingest` (currently disabled because ADB moved their CSV): want me to (a) leave it off, or (b) spend a step finding the new ADB sovereign-operations CSV URL and re-enabling it?
