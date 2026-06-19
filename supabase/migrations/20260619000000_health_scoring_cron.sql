-- Schedule the health-scoring agent.
--
-- The health-score feature (project_health_score migration, 2026-06-09) shipped
-- after the original agent cron migration (20260421000001), so health-scoring was
-- never put on a schedule — scores only refreshed on a manual staff trigger and
-- went stale. This adds a recurring job using the same pg_cron + net.http_post
-- pattern as 20260421000001.
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
      'app.service_role_key is not set - skipping health-scoring cron scheduling. On hosted, run: ALTER DATABASE postgres SET app.service_role_key = ''<your key>''; then re-run this script.';
    RETURN;
  END IF;

  auth_hdr := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || svc_key
  );

  -- Remove any existing job so this script is idempotent
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN ('infradar-health-scoring');

  -- Health Scoring: every 6 hours at :40 (offset from existing jobs). The agent
  -- batches the 30 oldest-scored projects per run (order by health_scored_at
  -- nulls first), so this cadence rotates through the portfolio steadily.
  PERFORM cron.schedule('infradar-health-scoring', '40 */6 * * *',
    format($q$SELECT net.http_post(url:='%s/health-score-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  RAISE NOTICE 'infradar-health-scoring cron job scheduled successfully.';
END;
$$;
