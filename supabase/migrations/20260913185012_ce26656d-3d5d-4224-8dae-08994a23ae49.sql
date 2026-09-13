INSERT INTO public.agent_config (agent_type, enabled, description)
VALUES ('personal-analyst', true, 'Per-user standing AI analyst: briefings, watch findings, standing answers, reports')
ON CONFLICT (agent_type) DO UPDATE SET enabled = true;

SELECT cron.schedule(
  'personal-analyst-dispatch',
  '20 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/personal-analyst',
    headers := public._agent_cron_auth_header(),
    body := jsonb_build_object('mode', 'dispatch', 'limit', 20),
    timeout_milliseconds := 120000
  );
  $$
);