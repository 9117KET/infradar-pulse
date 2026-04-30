-- 1) Rename cron jobs to match agent_type names

-- risk-scorer -> risk-scoring
SELECT cron.unschedule('risk-scorer');
SELECT cron.schedule(
  'risk-scoring',
  '0 12 * * *',
  $$
    SELECT net.http_post(
      url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/risk-scorer',
      headers := public._agent_cron_auth_header(),
      body := '{"scheduled": true}'::jsonb,
      timeout_milliseconds := 120000
    );
  $$
);

-- update-checker -> update-check
SELECT cron.unschedule('update-checker');
SELECT cron.schedule(
  'update-check',
  '0 8,20 * * *',
  $$
    SELECT net.http_post(
      url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/update-checker',
      headers := public._agent_cron_auth_header(),
      body := '{"scheduled": true}'::jsonb,
      timeout_milliseconds := 120000
    );
  $$
);

-- research-agent -> discovery (the agent's internal type is 'discovery')
SELECT cron.unschedule('research-agent');
SELECT cron.schedule(
  'discovery',
  '0 */2 * * *',
  $$
    SELECT net.http_post(
      url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/research-agent',
      headers := public._agent_cron_auth_header(),
      body := '{"scheduled": true}'::jsonb,
      timeout_milliseconds := 120000
    );
  $$
);

-- 2) Add missing insight-sources cron (Mon & Thu 04:15 UTC, low traffic)
SELECT cron.schedule(
  'insight-sources',
  '15 4 * * 1,4',
  $$
    SELECT net.http_post(
      url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/insight-sources-agent',
      headers := public._agent_cron_auth_header(),
      body := '{"scheduled": true}'::jsonb,
      timeout_milliseconds := 120000
    );
  $$
);

-- 3) Unschedule all currently disabled agents (stops wasted HTTP dispatch into pausedResponse)
DO $$
DECLARE
  job text;
  paused_jobs text[] := ARRAY[
    'adb-ingest','aiib-ingest','regulatory-monitor','supply-chain-monitor',
    'stakeholder-intel','corporate-ma-monitor','esg-social-monitor',
    'tender-award-monitor','security-resilience'
  ];
BEGIN
  FOREACH job IN ARRAY paused_jobs LOOP
    BEGIN
      PERFORM cron.unschedule(job);
    EXCEPTION WHEN OTHERS THEN
      -- ignore if cron job doesn't exist under this name
      NULL;
    END;
  END LOOP;
END $$;

-- 4) agent_health view: join agent_config with latest cron job status
CREATE OR REPLACE VIEW public.agent_health
WITH (security_invoker = true)
AS
SELECT
  ac.agent_type,
  ac.enabled,
  ac.last_run_status,
  ac.last_run_at,
  ac.last_duration_ms,
  ac.success_count,
  ac.failure_count,
  CASE
    WHEN (ac.success_count + ac.failure_count) = 0 THEN NULL
    ELSE ROUND(100.0 * ac.success_count / (ac.success_count + ac.failure_count), 1)
  END AS success_rate_pct,
  cj.jobid IS NOT NULL AS cron_scheduled,
  cj.schedule AS cron_schedule,
  cj.active AS cron_active,
  CASE
    WHEN ac.enabled = false THEN 'paused'
    WHEN cj.jobid IS NULL THEN 'no_cron'
    WHEN ac.last_run_at IS NULL THEN 'never_ran'
    WHEN ac.last_run_at < now() - interval '7 days' THEN 'stale'
    WHEN ac.last_run_status = 'failed' THEN 'failing'
    WHEN (ac.success_count + ac.failure_count) > 10
         AND ac.failure_count::numeric / NULLIF(ac.success_count + ac.failure_count, 0) > 0.5
      THEN 'degraded'
    ELSE 'healthy'
  END AS health_status
FROM public.agent_config ac
LEFT JOIN cron.job cj ON cj.jobname = ac.agent_type;

GRANT SELECT ON public.agent_health TO authenticated;

-- Restrict via RLS-equivalent: wrap in a security-definer function for staff-only reads
-- Views can't have RLS directly; use a policy on the underlying agent_config (already restricted).
-- The view inherits agent_config RLS via security_invoker=true.
