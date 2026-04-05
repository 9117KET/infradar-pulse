-- Reset research_tasks stuck in "running" for more than 10 minutes.
-- Idempotent: safe to run multiple times.
UPDATE public.research_tasks
SET
  status       = 'failed',
  error        = 'Task timed out: reset by stale-task migration (stuck >10 min)',
  completed_at = now()
WHERE
  status = 'running'
  AND created_at < now() - INTERVAL '10 minutes';
