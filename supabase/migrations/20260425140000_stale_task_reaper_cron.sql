-- Recurring pg_cron job that resets research_tasks stuck in "running" for
-- more than 10 minutes. Runs every 5 minutes using pure SQL (no HTTP call
-- needed, no service_role_key required beyond the pg_cron extension itself).
--
-- Prerequisites: pg_cron extension must be enabled on the Supabase project
-- (Database > Extensions > pg_cron in the Supabase dashboard).
-- The one-time migration 20260331000000 reset any existing stale tasks at
-- deploy time; this job keeps the table clean on an ongoing basis.

DO $$
BEGIN
  -- Remove existing job if present so this script is idempotent.
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname = 'infradar-stale-task-reaper';

  -- Schedule the reaper: every 5 minutes, pure SQL.
  PERFORM cron.schedule(
    'infradar-stale-task-reaper',
    '*/5 * * * *',
    $cron$
      UPDATE public.research_tasks
      SET
        status       = 'failed',
        error        = 'Agent timed out: no completion signal within 10 minutes',
        completed_at = now()
      WHERE status    = 'running'
        AND created_at < now() - INTERVAL '10 minutes';
    $cron$
  );

  RAISE NOTICE 'Stale task reaper scheduled (every 5 minutes).';
END;
$$;
