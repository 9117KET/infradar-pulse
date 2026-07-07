-- Register GEM, EIB and TED ingest agents + cron schedules.
--
-- gem-ingest: Global Energy Monitor Integrated Power Tracker (CC BY 4.0).
--   ~90k power units worldwide with EXACT facility coordinates. Hourly
--   backfill walks the 67 MB CSV via byte-range cursor, then rolls over.
-- eib-ingest: European Investment Bank financed projects (public JSON API,
--   ~17k approved/signed operations). Hourly backfill + nightly freshness.
-- ted-ingest: TED EU procurement notices (CPV 45*, free v3 API) → tender_events.
--
-- BEFORE running this on hosted, ensure app.service_role_key is set:
--   ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY_HERE';

-- 1. Register agent types (pauseable from /dashboard/agents)
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS description text;
INSERT INTO public.agent_config (agent_type, enabled, description) VALUES
  ('gem-ingest', true, 'Global Energy Monitor Integrated Power Tracker — facility-level power projects with exact coordinates (CC BY 4.0)'),
  ('eib-ingest', true, 'European Investment Bank financed projects via the public eib.org JSON API'),
  ('ted-ingest', true, 'TED EU procurement notices (construction CPV 45*) into tender_events')
ON CONFLICT (agent_type) DO NOTHING;

-- 2. Cron schedules
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

  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN ('infradar-gem-backfill', 'infradar-eib-backfill', 'infradar-ted-ingest');

  -- GEM: hourly at :26 — 150 plants/run ≈ full tracker in ~1-2 weeks
  PERFORM cron.schedule('infradar-gem-backfill', '26 * * * *',
    format($q$SELECT net.http_post(url:='%s/gem-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","limit":150}'::jsonb)$q$,
      base_url, auth_hdr));

  -- EIB: hourly at :42 — 300 records/run ≈ full 17k archive in ~2.5 days
  PERFORM cron.schedule('infradar-eib-backfill', '42 * * * *',
    format($q$SELECT net.http_post(url:='%s/eib-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","limit":300}'::jsonb)$q$,
      base_url, auth_hdr));

  -- TED: daily at 06:30 UTC — last 3 days of notices, deduped by URL
  PERFORM cron.schedule('infradar-ted-ingest', '30 6 * * *',
    format($q$SELECT net.http_post(url:='%s/ted-ingest-agent', headers:='%s'::jsonb, body:='{"days":3,"limit":300}'::jsonb)$q$,
      base_url, auth_hdr));

  RAISE NOTICE 'GEM, EIB and TED cron jobs scheduled successfully.';
END;
$$;
