# Scheduling agents (`Supabase`)

This project’s “agents” are `Supabase` Edge Functions that write progress into `public.research_tasks`. Scheduling is configured in `Supabase` (not in git) to avoid storing secrets in SQL or code.

## Prerequisites
- Deploy the Edge Functions to your `Supabase` project.
- Set required secrets in **`Supabase` Dashboard → Edge Functions → Secrets** (or via `supabase secrets set`).

## Recommended schedules (starter)
- `dataset-refresh-agent`: **hourly**
- `digest-agent`: **daily** (e.g., 07:00 UTC)
- `report-agent`: **weekly** (e.g., Monday 07:15 UTC)
- `research-agent`: **every 30 minutes** (already in Agent Monitoring)
- `source-ingest-agent`: **daily** (only if you’ve configured authenticated access)

## Create schedules in `Supabase` Dashboard
1. Go to **`Supabase` Dashboard → Edge Functions**.
2. Open the function (e.g., `digest-agent`).
3. Create a **Schedule** (`cron`) and choose `POST` as method.
4. Provide the JSON body (examples below).

### Example bodies

#### `dataset-refresh-agent`
```json
{ "dataset_key": "projects_v1" }
```

#### `digest-agent`
```json
{}
```

#### `report-agent`
```json
{ "report_type": "weekly_market_snapshot", "days": 7 }
```

#### `source-ingest-agent`
```json
{ "url": "https://example.com/infrastructure-report-oct-2025", "source_key": "infradar:oct-2025" }
```

## Observability
- All runs write rows to `public.research_tasks`.
- In the app, open **Dashboard → Agents** to see status, staleness, and live logs.

## Authenticated/premium sources
For controlled ingestion we currently support **cookie-based fetch + audit storage** in `public.raw_sources`.

Set these secrets (Dashboard → Edge Functions → Secrets):
- `SOURCE_SESSION_COOKIE`: Cookie header value for the dedicated service account session
- `INGEST_USER_AGENT`: optional user agent string

Important:
- Full browser automation is intentionally out of scope for Edge Functions. If a source requires JS-heavy login flows, run a separate worker and push results into `Supabase` via service role.


---

# Cron credentials runbook

## The failure this prevents

Between 2026-04-21 and 2026-07-06, seven migrations scheduled pg_cron jobs that
built the `Authorization` header **at schedule time**:

```sql
auth_hdr := jsonb_build_object('Authorization', 'Bearer ' || svc_key);
PERFORM cron.schedule(..., format('... headers:=''%s''::jsonb ...', auth_hdr));
```

That freezes a JWT into `cron.job.command`. When the project keys were rotated,
all 40 such jobs kept firing on schedule while every HTTP call returned 401.
Every agent went silent on **2026-07-22** and stayed silent for 34 days.

Two things made it invisible:

1. **Baked credentials** — no single place to rotate.
2. **`net.http_post()` is asynchronous.** It queues the request and returns an
   id, so pg_cron records the run as *succeeded* regardless of what the endpoint
   answers. `cron.job_run_details` stayed green through a month of 401s.

Only the external GitHub Actions heartbeat (`.github/workflows/cron-heartbeat.yml`)
caught it, because it checks the *outcome* — `agent_config.last_run_at` — rather
than whether the jobs fired.

## The fix

`supabase/migrations/20260828120000_cron_auth_via_vault.sql` makes every job
resolve its credential **at run time** from a single vault secret:

```sql
headers := public._agent_cron_auth_header()   -- reads vault on every call
```

Rotating keys is now a one-line vault update; no job is ever re-scheduled.

## Rotating the service-role key

```sql
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'email_queue_service_role_key'),
  '<new service_role key>',
  'email_queue_service_role_key',
  'Service-role key used by pg_cron to call Edge Functions.');

SELECT * FROM public.cron_auth_preflight();   -- must return ok = true
```

That is the whole procedure. Do not re-run the scheduling migrations.

## Diagnosing silence

```bash
npm run test:cron-auth                                  # local stack
SUPABASE_DB_URL='postgres://...' npm run test:cron-auth:prod
```

The script is read-only by default and reports, in order: whether the migration
is applied, whether the stored key is structurally valid, whether any job still
carries a literal token, how long the agents have actually been silent, and any
failed outbound HTTP calls in the last 24h.

By hand:

| Question | Query |
|---|---|
| Is the stored key usable? | `SELECT * FROM public.cron_auth_preflight();` |
| Any job still holding a token? | `SELECT * FROM public.cron_jobs_with_baked_credentials();` |
| What did the HTTP calls actually return? | `SELECT * FROM public.cron_http_failures LIMIT 20;` |
| Are the agents running? | `SELECT max(last_run_at) FROM agent_config WHERE enabled;` |

`cron_http_failures` is the important one: `job_run_details` cannot tell you a
call 401'd, because it only sees the enqueue.

## If a job regresses

Any new migration that bakes a token will be caught by
`public.cron_jobs_with_baked_credentials()`. To repair:

```sql
SELECT * FROM public.rewrite_cron_baked_credentials();
```

It is idempotent, preserves `jobid`, schedule, body and ownership, and handles
jobs owned by another role (`cron.job` has RLS on `username = CURRENT_USER`, and
`cron.alter_job` separately refuses jobs you do not own).

## Rule for new scheduled jobs

Always write:

```sql
SELECT cron.schedule('job-name', '*/30 * * * *', $$
  SELECT net.http_post(
    url     := 'https://<project>.supabase.co/functions/v1/<function>',
    headers := public._agent_cron_auth_header(),
    body    := '{}'::jsonb);
$$);
```

Never interpolate a key into the command string.

## Tests

`supabase/tests/cron_auth_vault.test.sql` — 46 assertions across 7 groups,
wrapped in `BEGIN`/`ROLLBACK` so it is safe to run against any database
including production. Covers key validation (missing, blank, anon-role,
expired, opaque `sb_secret_*`, publishable), the helper's fail-loud behaviour,
the rewriter against real production command shapes, unrecognised shapes being
reported rather than mangled, a full rotation simulation, and foreign-owned
jobs.
