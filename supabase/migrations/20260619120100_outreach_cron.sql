-- Schedule the semi-autonomous outbound agents.
--
-- Same pg_cron + net.http_post pattern as 20260619000000_health_scoring_cron.sql.
-- Cadence is deliberately gentle to protect sender-domain reputation:
--   * outreach_draft  — once daily; drafts the next touch for due prospects (no send).
--   * outreach_send   — weekday business hours, throttled (the function caps each
--                       run at 50 emails and only sends human-APPROVED messages).
--   * weekly_signal   — weekly inbound newsletter.
--
-- Each agent can still be paused independently from the AgentMonitoring dashboard
-- (agent_config), so disabling a job here is not required to stop one.
--
-- Prereq (hosted, once): ALTER DATABASE postgres SET app.service_role_key = '<key>';
-- Idempotent — safe to re-run.

DO $$
DECLARE
  base_url TEXT := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1';
  svc_key  TEXT := current_setting('app.service_role_key', true);
  auth_hdr JSONB;
BEGIN
  IF svc_key IS NULL OR svc_key = '' THEN
    -- Local stacks (supabase db reset) have no app.service_role_key and don't
    -- need hosted cron jobs. Skip instead of failing so local resets work.
    RAISE NOTICE
      'app.service_role_key is not set - skipping outreach cron scheduling. On hosted, run: ALTER DATABASE postgres SET app.service_role_key = ''<your key>''; then re-run this script.';
    RETURN;
  END IF;

  auth_hdr := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || svc_key
  );

  -- Remove any existing jobs so this script is idempotent
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN ('infradar-outreach-draft', 'infradar-outreach-send', 'infradar-weekly-signal');

  -- Draft next touches: daily at 06:15 UTC (off-peak).
  PERFORM cron.schedule('infradar-outreach-draft', '15 6 * * *',
    format($q$SELECT net.http_post(url:='%s/outreach-draft-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Send approved emails: every 2h from 09:00-15:00 UTC, weekdays only.
  PERFORM cron.schedule('infradar-outreach-send', '0 9-15/2 * * 1-5',
    format($q$SELECT net.http_post(url:='%s/outreach-send-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Weekly Infrastructure Signal: Mondays at 13:00 UTC.
  PERFORM cron.schedule('infradar-weekly-signal', '0 13 * * 1',
    format($q$SELECT net.http_post(url:='%s/weekly-signal-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  RAISE NOTICE 'outreach cron jobs scheduled successfully.';
END;
$$;
