-- Backfill cron schedules for the deterministic official-registry ingest agents.
--
-- Each job runs with body {"mode":"backfill", ...}: the agent resumes from its
-- persisted ingest_cursors offset and advances it, so hourly runs walk the
-- entire upstream dataset over time. When a source is exhausted the cursor
-- resets to 0 and the same jobs become rolling freshness re-pulls.
--
-- The existing nightly jobs (20260421000001, 20260427210000) stay as-is for
-- top-of-dataset freshness; these hourly jobs provide depth. Jobs are
-- staggered to avoid concurrent edge invocations (each agent also holds a
-- per-agent concurrency lock, so overlap is safe but wasteful).
--
-- BEFORE running this on hosted, ensure app.service_role_key is set:
--   ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY_HERE';

DO $$
DECLARE
  base_url TEXT := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1';
  svc_key  TEXT := current_setting('app.service_role_key', true);
  auth_hdr JSONB;
BEGIN
  IF svc_key IS NULL OR svc_key = '' THEN
    RAISE NOTICE
      'app.service_role_key is not set - skipping cron job scheduling. On hosted, run: ALTER DATABASE postgres SET app.service_role_key = ''<your key>''; then re-run this script.';
    RETURN;
  END IF;

  auth_hdr := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || svc_key
  );

  -- Remove existing jobs if re-running
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN (
    'infradar-world-bank-backfill',
    'infradar-ifc-backfill',
    'infradar-adb-backfill',
    'infradar-iadb-backfill',
    'infradar-aiib-backfill'
  );

  -- World Bank: hourly at :05 — 500 records/run walks the full infra dataset
  -- (~10k projects across statuses) in about a day.
  PERFORM cron.schedule('infradar-world-bank-backfill', '5 * * * *',
    format($q$SELECT net.http_post(url:='%s/world-bank-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","status":"Active,Pipeline,Closed","limit":500}'::jsonb)$q$,
      base_url, auth_hdr));

  -- IFC: hourly at :20
  PERFORM cron.schedule('infradar-ifc-backfill', '20 * * * *',
    format($q$SELECT net.http_post(url:='%s/ifc-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","status":"Active,Pipeline,Closed","limit":500}'::jsonb)$q$,
      base_url, auth_hdr));

  -- ADB: hourly at :35
  PERFORM cron.schedule('infradar-adb-backfill', '35 * * * *',
    format($q$SELECT net.http_post(url:='%s/adb-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","limit":500}'::jsonb)$q$,
      base_url, auth_hdr));

  -- IADB: hourly at :50
  PERFORM cron.schedule('infradar-iadb-backfill', '50 * * * *',
    format($q$SELECT net.http_post(url:='%s/iadb-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","status":"Active,Implementation,Closed","limit":500}'::jsonb)$q$,
      base_url, auth_hdr));

  -- AIIB: hourly at :12 — small dataset (~300 rows), capped at 150/run for
  -- edge CPU headroom; exhausts in a couple of runs then rolls over.
  PERFORM cron.schedule('infradar-aiib-backfill', '12 * * * *',
    format($q$SELECT net.http_post(url:='%s/aiib-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","limit":150}'::jsonb)$q$,
      base_url, auth_hdr));

  RAISE NOTICE 'Backfill cron jobs scheduled successfully.';
END;
$$;
