-- Fix: agent cron jobs were calling edge functions with the anon key, which
-- requireStaffOrRespond rejects with 401 "Sign in required.". This stopped
-- all background research/discovery for >24h. Replace with service-role JWT
-- pulled from vault (same pattern process-email-queue uses).
--
-- Also de-duplicates: there were two parallel cron jobs per agent
-- (e.g. research-agent-discovery + research-agent-schedule). Keep one each.

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobname FROM cron.job
    WHERE jobname IN (
      'research-agent-discovery','research-agent-schedule',
      'update-checker-monitor','update-checker-schedule',
      'risk-scorer-assessment','risk-scorer-schedule',
      'stakeholder-intel-6h','stakeholder-intel-schedule',
      'funding-tracker-4h','funding-tracker-schedule',
      'regulatory-monitor-3h','regulatory-monitor-schedule',
      'sentiment-analyzer-2h','sentiment-analyzer-schedule',
      'supply-chain-4h','supply-chain-schedule',
      'market-intel-6h','market-intel-schedule',
      'contact-finder-agent','contact-finder-schedule',
      'data-enrichment-schedule','alert-intelligence-schedule'
    )
  LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
END $$;

-- Helper: build authorization header from vault.
CREATE OR REPLACE FUNCTION public._agent_cron_auth_header()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'email_queue_service_role_key'
      LIMIT 1
    )
  );
$$;

REVOKE ALL ON FUNCTION public._agent_cron_auth_header() FROM PUBLIC;

-- Re-create one cron per agent, calling with the service role token.
SELECT cron.schedule(
  'research-agent',
  '*/30 * * * *',
  $$ SELECT net.http_post(
       url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/research-agent',
       headers := public._agent_cron_auth_header(),
       body := '{"scheduled": true}'::jsonb
     ); $$
);

SELECT cron.schedule(
  'update-checker',
  '0 */2 * * *',
  $$ SELECT net.http_post(
       url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/update-checker',
       headers := public._agent_cron_auth_header(),
       body := '{"scheduled": true}'::jsonb
     ); $$
);

SELECT cron.schedule(
  'risk-scorer',
  '0 */4 * * *',
  $$ SELECT net.http_post(
       url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/risk-scorer',
       headers := public._agent_cron_auth_header(),
       body := '{"scheduled": true}'::jsonb
     ); $$
);

SELECT cron.schedule(
  'stakeholder-intel',
  '0 */6 * * *',
  $$ SELECT net.http_post(
       url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/stakeholder-intel',
       headers := public._agent_cron_auth_header(),
       body := '{"scheduled": true}'::jsonb
     ); $$
);

SELECT cron.schedule(
  'funding-tracker',
  '30 */4 * * *',
  $$ SELECT net.http_post(
       url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/funding-tracker',
       headers := public._agent_cron_auth_header(),
       body := '{"scheduled": true}'::jsonb
     ); $$
);

SELECT cron.schedule(
  'regulatory-monitor',
  '15 */3 * * *',
  $$ SELECT net.http_post(
       url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/regulatory-monitor',
       headers := public._agent_cron_auth_header(),
       body := '{"scheduled": true}'::jsonb
     ); $$
);

SELECT cron.schedule(
  'sentiment-analyzer',
  '45 */2 * * *',
  $$ SELECT net.http_post(
       url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/sentiment-analyzer',
       headers := public._agent_cron_auth_header(),
       body := '{"scheduled": true}'::jsonb
     ); $$
);

SELECT cron.schedule(
  'supply-chain-monitor',
  '0 1,5,9,13,17,21 * * *',
  $$ SELECT net.http_post(
       url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/supply-chain-monitor',
       headers := public._agent_cron_auth_header(),
       body := '{"scheduled": true}'::jsonb
     ); $$
);

SELECT cron.schedule(
  'market-intel',
  '30 0,6,12,18 * * *',
  $$ SELECT net.http_post(
       url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/market-intel',
       headers := public._agent_cron_auth_header(),
       body := '{"scheduled": true}'::jsonb
     ); $$
);

SELECT cron.schedule(
  'contact-finder',
  '0 */3 * * *',
  $$ SELECT net.http_post(
       url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/contact-finder',
       headers := public._agent_cron_auth_header(),
       body := '{"scheduled": true}'::jsonb
     ); $$
);

SELECT cron.schedule(
  'data-enrichment',
  '0 */2 * * *',
  $$ SELECT net.http_post(
       url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/data-enrichment',
       headers := public._agent_cron_auth_header(),
       body := '{"scheduled": true}'::jsonb
     ); $$
);

SELECT cron.schedule(
  'alert-intelligence',
  '0 */4 * * *',
  $$ SELECT net.http_post(
       url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/alert-intelligence',
       headers := public._agent_cron_auth_header(),
       body := '{"scheduled": true}'::jsonb
     ); $$
);

-- Seed agent_config rows so the Agent Monitoring dashboard shows them.
INSERT INTO public.agent_config (agent_type, enabled) VALUES
  ('discovery', true),
  ('update-check', true),
  ('risk-scoring', true),
  ('stakeholder-intel', true),
  ('funding-tracker', true),
  ('regulatory-monitor', true),
  ('sentiment-analyzer', true),
  ('supply-chain-monitor', true),
  ('market-intel', true),
  ('contact-finder', true),
  ('data-enrichment', true),
  ('alert-intelligence', true)
ON CONFLICT (agent_type) DO NOTHING;