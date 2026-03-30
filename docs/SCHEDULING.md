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

