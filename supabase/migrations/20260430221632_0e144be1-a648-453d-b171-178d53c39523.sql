-- =========================================================================
-- Week 1: Agent pipeline optimization
-- =========================================================================

-- 1. Reduce cron frequencies (unschedule + reschedule)
DO $$
DECLARE
  v_reschedule jsonb := '[
    {"name":"research-agent",        "cron":"0 */2 * * *"},
    {"name":"world-bank-ingest",     "cron":"0 3 * * 1"},
    {"name":"ifc-ingest",            "cron":"30 3 * * 2"},
    {"name":"afdb-ingest",           "cron":"0 4 * * 3"},
    {"name":"ebrd-ingest",           "cron":"30 4 * * 4"},
    {"name":"iadb-ingest",           "cron":"0 5 * * 5"},
    {"name":"data-enrichment",       "cron":"0 */6 * * *"},
    {"name":"update-checker",        "cron":"0 8,20 * * *"},
    {"name":"contact-finder",        "cron":"0 */12 * * *"},
    {"name":"alert-intelligence",    "cron":"0 */6 * * *"},
    {"name":"risk-scorer",           "cron":"0 12 * * *"},
    {"name":"funding-tracker",       "cron":"0 */12 * * *"},
    {"name":"market-intel",          "cron":"0 6 * * *"},
    {"name":"sentiment-analyzer",    "cron":"0 */12 * * *"},
    {"name":"dataset-refresh",       "cron":"30 0 * * *"},
    {"name":"executive-briefing",    "cron":"0 8 * * 1"}
  ]'::jsonb;
  v_item jsonb;
  v_existing_jobid bigint;
  v_existing_command text;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_reschedule)
  LOOP
    SELECT jobid, command INTO v_existing_jobid, v_existing_command
    FROM cron.job WHERE jobname = v_item->>'name';

    IF v_existing_jobid IS NOT NULL THEN
      PERFORM cron.unschedule(v_existing_jobid);
      PERFORM cron.schedule(v_item->>'name', v_item->>'cron', v_existing_command);
    END IF;
  END LOOP;
END $$;

-- 2. Add cron for generate-insight (Tue + Fri at 09:00 UTC)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-insight') THEN
    PERFORM cron.schedule(
      'generate-insight',
      '0 9 * * 2,5',
      $cmd$
        SELECT net.http_post(
          url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/generate-insight',
          headers := public._agent_cron_auth_header(),
          body := '{"scheduled": true}'::jsonb,
          timeout_milliseconds := 120000
        );
      $cmd$
    );
  END IF;
END $$;

-- 3. Stuck-task reaper: auto-fail any research_task stuck in 'running' for >30 min
CREATE OR REPLACE FUNCTION public.reap_stuck_research_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.research_tasks
  SET status = 'failed',
      error = COALESCE(NULLIF(error, ''), '') ||
              CASE WHEN COALESCE(error, '') = '' THEN '' ELSE ' | ' END ||
              '[auto-reaped: stuck running >30m]',
      completed_at = now()
  WHERE status = 'running'
    AND created_at < now() - interval '30 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    PERFORM public.rebuild_agent_config_from_tasks();
  END IF;

  RETURN v_count;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reap-stuck-tasks') THEN
    PERFORM cron.schedule(
      'reap-stuck-tasks',
      '*/5 * * * *',
      $cmd$ SELECT public.reap_stuck_research_tasks(); $cmd$
    );
  END IF;
END $$;

-- 4. Reap right now to clear the 3 currently-stuck tasks
SELECT public.reap_stuck_research_tasks();

-- 5. Pause broken agents in agent_config so the dashboard reflects reality
INSERT INTO public.agent_config (agent_type, enabled, updated_at)
VALUES
  ('adb-ingest', false, now()),
  ('aiib-ingest', false, now()),
  ('regulatory-monitor', false, now()),
  ('supply-chain-monitor', false, now()),
  ('stakeholder-intel', false, now()),
  ('corporate-ma-monitor', false, now()),
  ('esg-social-monitor', false, now()),
  ('tender-award-monitor', false, now()),
  ('security-resilience', false, now())
ON CONFLICT (agent_type) DO UPDATE SET
  enabled = false,
  updated_at = now();

-- 6. Ensure generate-insight has an agent_config row (so toggle works)
INSERT INTO public.agent_config (agent_type, enabled, updated_at)
VALUES ('generate-insight', true, now())
ON CONFLICT (agent_type) DO NOTHING;