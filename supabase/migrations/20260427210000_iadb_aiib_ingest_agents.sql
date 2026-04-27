-- Add IADB and AIIB ingest agents to agent_config and cron schedules.
-- IADB: Inter-American Development Bank (free CKAN REST API, no key required)
-- AIIB: Asian Infrastructure Investment Bank (Firecrawl scraping, requires FIRECRAWL_API_KEY)

-- 1. Register new agent types in agent_config
INSERT INTO public.agent_config (agent_type) VALUES
  ('iadb-ingest'),
  ('aiib-ingest')
ON CONFLICT (agent_type) DO NOTHING;

-- 2. Schedule cron jobs
--
-- BEFORE running this, ensure app.service_role_key is set:
--   ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY_HERE';

DO $$
DECLARE
  base_url TEXT := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1';
  svc_key  TEXT := current_setting('app.service_role_key', true);
  auth_hdr JSONB;
BEGIN
  IF svc_key IS NULL OR svc_key = '' THEN
    RAISE EXCEPTION
      'app.service_role_key is not set. Run: ALTER DATABASE postgres SET app.service_role_key = ''<your key>'';';
  END IF;

  auth_hdr := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || svc_key
  );

  -- Remove existing jobs if re-running
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN ('infradar-iadb-ingest', 'infradar-aiib-ingest');

  -- IADB Ingest: daily at 05:30 UTC (staggered after EBRD at 05:00)
  PERFORM cron.schedule('infradar-iadb-ingest', '30 5 * * *',
    format($q$SELECT net.http_post(url:='%s/iadb-ingest-agent', headers:='%s'::jsonb, body:='{"status":"Active,Implementation","limit":300}'::jsonb)$q$,
      base_url, auth_hdr));

  -- AIIB Ingest: daily at 06:00 UTC
  PERFORM cron.schedule('infradar-aiib-ingest', '0 6 * * *',
    format($q$SELECT net.http_post(url:='%s/aiib-ingest-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  RAISE NOTICE 'IADB and AIIB cron jobs scheduled successfully.';
END;
$$;
