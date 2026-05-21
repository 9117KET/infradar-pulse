-- Rate limit table for the public Ask AI demo (no auth required).
-- Stores a hashed IP + date + count so we can cap to 3 queries/IP/day
-- without storing raw IP addresses.
-- Rows older than 7 days are cleaned up automatically.

create table if not exists public.public_demo_rate_limits (
  ip_hash   text    not null,
  query_date date   not null default current_date,
  count     integer not null default 0,
  primary key (ip_hash, query_date)
);

-- Index for cheap date-range cleanup
create index if not exists public_demo_rate_limits_date_idx
  on public.public_demo_rate_limits (query_date);

-- No RLS needed - only accessed by service-role from the Edge Function.
-- Restrict direct client access entirely.
alter table public.public_demo_rate_limits enable row level security;

-- Auto-cleanup rows older than 7 days once per day via pg_cron.
-- This keeps the table tiny (max ~7 days of IPs).
select cron.schedule(
  'cleanup-demo-rate-limits',
  '0 3 * * *',
  $$delete from public.public_demo_rate_limits where query_date < current_date - interval '7 days'$$
);
