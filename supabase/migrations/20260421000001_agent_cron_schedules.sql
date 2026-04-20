-- Agent Cron Schedules
-- Sets up pg_cron jobs for all 26 agents so they run automatically.
--
-- BEFORE running this SQL, execute the following once in the SQL editor
-- (replace the placeholder with your actual service_role key from
--  Supabase Dashboard > Settings > API > service_role):
--
--   ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY_HERE';
--
-- After that, run this entire script. It is idempotent - safe to re-run.

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

  -- Remove any existing jobs so this script is idempotent
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN (
    'infradar-research-agent',
    'infradar-world-bank-ingest',
    'infradar-ifc-ingest',
    'infradar-adb-ingest',
    'infradar-afdb-ingest',
    'infradar-ebrd-ingest',
    'infradar-update-checker',
    'infradar-risk-scorer',
    'infradar-stakeholder-intel',
    'infradar-funding-tracker',
    'infradar-regulatory-monitor',
    'infradar-sentiment-analyzer',
    'infradar-supply-chain',
    'infradar-market-intel',
    'infradar-contact-finder',
    'infradar-alert-intelligence',
    'infradar-data-enrichment',
    'infradar-digest-agent',
    'infradar-dataset-refresh',
    'infradar-report-agent',
    'infradar-entity-dedup',
    'infradar-corporate-ma',
    'infradar-esg-social',
    'infradar-security-resilience',
    'infradar-tender-award',
    'infradar-executive-briefing'
  );

  -- Research Agent: every 30 minutes
  PERFORM cron.schedule('infradar-research-agent', '*/30 * * * *',
    format($q$SELECT net.http_post(url:='%s/research-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- World Bank Ingest: daily at 03:00 UTC
  PERFORM cron.schedule('infradar-world-bank-ingest', '0 3 * * *',
    format($q$SELECT net.http_post(url:='%s/world-bank-ingest-agent', headers:='%s'::jsonb, body:='{"status":"Active,Pipeline","limit":200}'::jsonb)$q$,
      base_url, auth_hdr));

  -- IFC Ingest: daily at 03:30 UTC
  PERFORM cron.schedule('infradar-ifc-ingest', '30 3 * * *',
    format($q$SELECT net.http_post(url:='%s/ifc-ingest-agent', headers:='%s'::jsonb, body:='{"status":"Active,Pipeline","limit":200}'::jsonb)$q$,
      base_url, auth_hdr));

  -- ADB Ingest: daily at 04:00 UTC
  PERFORM cron.schedule('infradar-adb-ingest', '0 4 * * *',
    format($q$SELECT net.http_post(url:='%s/adb-ingest-agent', headers:='%s'::jsonb, body:='{"limit":300}'::jsonb)$q$,
      base_url, auth_hdr));

  -- AfDB Ingest: daily at 04:30 UTC
  PERFORM cron.schedule('infradar-afdb-ingest', '30 4 * * *',
    format($q$SELECT net.http_post(url:='%s/afdb-ingest-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- EBRD Ingest: daily at 05:00 UTC
  PERFORM cron.schedule('infradar-ebrd-ingest', '0 5 * * *',
    format($q$SELECT net.http_post(url:='%s/ebrd-ingest-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Update Checker: every 2 hours
  PERFORM cron.schedule('infradar-update-checker', '0 */2 * * *',
    format($q$SELECT net.http_post(url:='%s/update-checker', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Risk Scorer: every 4 hours at :05
  PERFORM cron.schedule('infradar-risk-scorer', '5 */4 * * *',
    format($q$SELECT net.http_post(url:='%s/risk-scorer', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Stakeholder Intel: every 6 hours
  PERFORM cron.schedule('infradar-stakeholder-intel', '0 */6 * * *',
    format($q$SELECT net.http_post(url:='%s/stakeholder-intel', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Funding Tracker: every 4 hours at :30
  PERFORM cron.schedule('infradar-funding-tracker', '30 */4 * * *',
    format($q$SELECT net.http_post(url:='%s/funding-tracker', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Regulatory Monitor: every 3 hours
  PERFORM cron.schedule('infradar-regulatory-monitor', '0 */3 * * *',
    format($q$SELECT net.http_post(url:='%s/regulatory-monitor', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Sentiment Analyzer: every 2 hours at :45
  PERFORM cron.schedule('infradar-sentiment-analyzer', '45 */2 * * *',
    format($q$SELECT net.http_post(url:='%s/sentiment-analyzer', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Supply Chain: every 4 hours at :15
  PERFORM cron.schedule('infradar-supply-chain', '15 */4 * * *',
    format($q$SELECT net.http_post(url:='%s/supply-chain-monitor', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Market Intel: every 6 hours at :30
  PERFORM cron.schedule('infradar-market-intel', '30 */6 * * *',
    format($q$SELECT net.http_post(url:='%s/market-intel', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Contact Finder: every 3 hours at :30
  PERFORM cron.schedule('infradar-contact-finder', '30 */3 * * *',
    format($q$SELECT net.http_post(url:='%s/contact-finder', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Alert Intelligence: every 4 hours at :50
  PERFORM cron.schedule('infradar-alert-intelligence', '50 */4 * * *',
    format($q$SELECT net.http_post(url:='%s/alert-intelligence', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Data Enrichment: every 2 hours at :20
  PERFORM cron.schedule('infradar-data-enrichment', '20 */2 * * *',
    format($q$SELECT net.http_post(url:='%s/data-enrichment', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Digest Agent: daily at 07:00 UTC
  PERFORM cron.schedule('infradar-digest-agent', '0 7 * * *',
    format($q$SELECT net.http_post(url:='%s/digest-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Dataset Refresh: hourly at :05
  PERFORM cron.schedule('infradar-dataset-refresh', '5 * * * *',
    format($q$SELECT net.http_post(url:='%s/dataset-refresh-agent', headers:='%s'::jsonb, body:='{"dataset_key":"projects_v1"}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Report Agent: weekly Monday at 06:00 UTC
  PERFORM cron.schedule('infradar-report-agent', '0 6 * * 1',
    format($q$SELECT net.http_post(url:='%s/report-agent', headers:='%s'::jsonb, body:='{"report_type":"weekly_market_snapshot","days":7}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Entity Dedup: daily at 02:00 UTC
  PERFORM cron.schedule('infradar-entity-dedup', '0 2 * * *',
    format($q$SELECT net.http_post(url:='%s/entity-dedup', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Corporate / M&A: every 6 hours at :15
  PERFORM cron.schedule('infradar-corporate-ma', '15 */6 * * *',
    format($q$SELECT net.http_post(url:='%s/corporate-ma-monitor', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- ESG & Social: every 4 hours at :20
  PERFORM cron.schedule('infradar-esg-social', '20 */4 * * *',
    format($q$SELECT net.http_post(url:='%s/esg-social-monitor', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Security & Resilience: every 4 hours at :35
  PERFORM cron.schedule('infradar-security-resilience', '35 */4 * * *',
    format($q$SELECT net.http_post(url:='%s/security-resilience', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Tender / Award: every 4 hours at :45
  PERFORM cron.schedule('infradar-tender-award', '45 */4 * * *',
    format($q$SELECT net.http_post(url:='%s/tender-award-monitor', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Executive Briefing: daily at 08:00 UTC
  PERFORM cron.schedule('infradar-executive-briefing', '0 8 * * *',
    format($q$SELECT net.http_post(url:='%s/executive-briefing', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  RAISE NOTICE 'All 26 infradar cron jobs scheduled successfully.';
END;
$$;
