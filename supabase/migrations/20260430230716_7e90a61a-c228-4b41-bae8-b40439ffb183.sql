-- Re-schedule AIIB ingest now that the agent uses the official AIIB data feed
-- (no LLM, no external paid API). Runs once daily at 04:25 UTC to stagger
-- against the other MDB ingests (WB at :00, IFC at :05, IADB at :10).
-- ADB ingest remains unscheduled and disabled until ADB Open Data restores a
-- public CSV/API endpoint.

DO $$
BEGIN
  -- Defensive unschedule in case any prior name lingers
  PERFORM cron.unschedule('aiib-ingest') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aiib-ingest');
  PERFORM cron.unschedule('infradar-aiib-ingest') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'infradar-aiib-ingest');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'aiib-ingest',
  '25 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/aiib-ingest-agent',
    headers := public._agent_cron_auth_header(),
    body := '{"scheduled": true, "limit": 500}'::jsonb
  );
  $$
);