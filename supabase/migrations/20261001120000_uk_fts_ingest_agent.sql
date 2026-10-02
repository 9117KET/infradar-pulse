-- uk-fts-ingest: UK Find a Tender Service notices (free OCDS API, CPV 45*)
-- into tender_events, alongside ted-ingest for the EU.
INSERT INTO public.agent_config (agent_type, enabled, description)
VALUES ('uk-fts-ingest', true, 'UK Find a Tender (OCDS) construction notices (CPV 45*) into tender_events')
ON CONFLICT (agent_type) DO NOTHING;

-- Daily, 30 min after TED. Auth is read from vault at call time
-- (see 20260828120000_cron_auth_via_vault.sql) so key rotation needs no reschedule.
SELECT cron.unschedule('infradar-uk-fts-ingest')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'infradar-uk-fts-ingest');

SELECT cron.schedule(
  'infradar-uk-fts-ingest',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/uk-fts-ingest-agent',
    headers := public._agent_cron_auth_header(),
    body := jsonb_build_object('days', 2, 'max_pages', 40),
    timeout_milliseconds := 150000
  );
  $$
);
