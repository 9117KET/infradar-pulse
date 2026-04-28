## What I found

The failures shown on `/dashboard/agents` are not primarily the earlier 401 auth issue. The current failures are mostly agent implementation/runtime problems:

- Several monitor agents only call Perplexity directly and fail with `No research text` when that call returns empty, errors, or the secret is not visible in that deployed function.
- Some agents do not record `finish_agent_run`, so `agent_config` summary counts and last-run timestamps can remain inaccurate even when `research_tasks` shows new runs.
- ADB ingest relies on brittle CKAN/direct CSV discovery and currently cannot locate the dataset.
- The dashboard still starts multiple heavy paginated queries from the browser, so accurate state can lag after login and page load.

## Plan

### 1. Standardize agent lifecycle tracking across all agents
Update all agent functions that create `research_tasks` rows to use the shared lifecycle helpers consistently:

- Import and call `finishAgentRun(...)` after every completed/failed task update.
- Add `setTaskStep(...)` where useful so the live process panel shows real progress.
- Ensure every early return updates both `research_tasks` and `agent_config`.
- Keep the secure staff/service-role gate in place for scheduled and manual runs.

This will make total runs, last run, stale status, and success/failure counts reflect all runs instead of only agents that already call the stats RPC.

### 2. Fix Perplexity-backed monitor failures
Create a shared research helper for agents that need live web intelligence:

- Detect whether `PERPLEXITY_API_KEY` is present.
- Call Perplexity with consistent request/response validation.
- Log safe metadata only, never secret values.
- Return a clear failure reason when the API returns an error or empty response.
- Where possible, add a Firecrawl/search fallback for agents already designed around web research.

Apply this to:

- `stakeholder-intel`
- `regulatory-monitor`
- `supply-chain-monitor`
- `corporate-ma-monitor`
- `esg-social-monitor`
- `tender-award-monitor`
- `security-resilience`
- any other agent found with the same `No research text` pattern

### 3. Repair ADB ingest discovery
Replace the brittle ADB discovery block with a more robust sequence:

- Try current CKAN package IDs and CKAN package search terms.
- Accept CSV resources by URL, MIME type, or name instead of only exact `format === CSV`.
- Validate candidate CSVs by downloading a small sample instead of relying on `HEAD` only.
- Add updated known fallback URLs if available.
- Return a diagnostic result showing which discovery methods were tried if no dataset is found.

### 4. Move dashboard aggregate loading server-side
Add or update a backend RPC for agent monitoring that returns one compact payload:

- agent summary rows from `agent_config`
- latest task per agent
- recent live log entries
- scheduler activity
- global totals
- optional data coverage counts

Then update `AgentMonitoring.tsx` to call this compact summary first, before running any heavy coverage queries. Heavy coverage can remain secondary/lazy.

This will make the page render accurate cards quickly instead of waiting for multiple browser-side paginated scans.

### 5. Backfill and reconcile agent stats
Run a migration/query to rebuild `agent_config` from all historical `research_tasks`, not just the first 1000 rows:

- `success_count = count(completed)`
- `failure_count = count(failed)`
- `last_run_at = max(created_at/completed_at)`
- `last_run_status = status of latest run`

This fixes stale totals after deploying the function changes.

### 6. Deploy and verify all affected functions
After code changes:

- Run TypeScript/build checks.
- Deploy every affected agent function plus any shared helper changes.
- Smoke test representative functions with both service-role scheduled auth and admin-user auth.
- Check function logs for Perplexity/ADB failures.
- Confirm `/dashboard/agents` shows recent run times, accurate counts, and fewer stale agents.

## Technical notes

- I will not edit the generated backend client/type files manually.
- Secrets already show as configured in project runtime secrets, so I will not ask you to re-enter them unless verification shows a connector/linking problem.
- Scheduled agent auth will continue using the service-role token pattern required for cron jobs.
- The dashboard should stop depending on client-side 1000-row windows for all-time totals.