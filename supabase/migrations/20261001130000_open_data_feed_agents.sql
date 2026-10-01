-- Open-data feeds beyond the MDB project pipelines:
--   wb-procurement-ingest : World Bank procurement notices (civil works + consulting EOIs) → tender_events
--   za-etenders-ingest    : South Africa eTender Portal OCDS (construction) → tender_events
--   project-news-monitor  : GDELT news on tracked/largest projects → evidence_sources (+ event alerts)
INSERT INTO public.agent_config (agent_type, enabled, description) VALUES
  ('wb-procurement-ingest', true, 'World Bank procurement notices (civil works, consulting EOIs) into tender_events'),
  ('za-etenders-ingest', true, 'South Africa eTender Portal (OCDS) construction tenders into tender_events'),
  ('project-news-monitor', true, 'GDELT news mentions of tracked projects into evidence, with event alerts')
ON CONFLICT (agent_type) DO NOTHING;

SELECT cron.unschedule(jobname) FROM cron.job
WHERE jobname IN ('infradar-wb-procurement-ingest', 'infradar-za-etenders-ingest', 'infradar-project-news-monitor');

-- Auth is read from vault at call time (20260828120000_cron_auth_via_vault.sql).
SELECT cron.schedule('infradar-wb-procurement-ingest', '15 */6 * * *', $$
  SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/wb-procurement-ingest-agent',
    headers := public._agent_cron_auth_header(),
    body := jsonb_build_object('days', 2, 'max_rows', 1500),
    timeout_milliseconds := 150000);
$$);

SELECT cron.schedule('infradar-za-etenders-ingest', '45 5 * * *', $$
  SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/za-etenders-ingest-agent',
    headers := public._agent_cron_auth_header(),
    body := jsonb_build_object('days', 3, 'max_pages', 6),
    timeout_milliseconds := 150000);
$$);

-- Hourly small batches stay under GDELT's rate limit (~240 project checks/day).
SELECT cron.schedule('infradar-project-news-monitor', '40 * * * *', $$
  SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/project-news-monitor',
    headers := public._agent_cron_auth_header(),
    body := jsonb_build_object('limit', 10, 'timespan', '7d'),
    timeout_milliseconds := 150000);
$$);
