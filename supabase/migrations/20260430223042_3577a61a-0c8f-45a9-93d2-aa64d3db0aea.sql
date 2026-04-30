DROP VIEW IF EXISTS public.agent_health;

CREATE VIEW public.agent_health
WITH (security_invoker = true)
AS
SELECT
  ac.agent_type,
  ac.enabled,
  ac.last_run_status,
  ac.last_run_at,
  ac.last_duration_ms,
  ac.success_count,
  ac.failure_count,
  CASE
    WHEN (ac.success_count + ac.failure_count) = 0 THEN NULL
    ELSE ROUND(100.0 * ac.success_count / (ac.success_count + ac.failure_count), 1)
  END AS success_rate_pct,
  COALESCE(r.recent_runs_24h, 0) AS recent_runs_24h,
  CASE
    WHEN COALESCE(r.recent_runs_24h, 0) = 0 THEN NULL
    ELSE ROUND(100.0 * r.recent_failures_24h / r.recent_runs_24h, 1)
  END AS recent_failure_rate_pct,
  cj.jobid IS NOT NULL AS cron_scheduled,
  cj.schedule AS cron_schedule,
  cj.active AS cron_active,
  CASE
    WHEN ac.enabled = false THEN 'paused'
    WHEN cj.jobid IS NULL AND ac.agent_type NOT IN ('user-research') THEN 'no_cron'
    WHEN ac.last_run_at IS NULL THEN 'never_ran'
    WHEN ac.last_run_at < now() - interval '7 days' THEN 'stale'
    WHEN COALESCE(r.recent_runs_24h, 0) >= 3
         AND r.recent_failures_24h::numeric / r.recent_runs_24h > 0.5
      THEN 'failing'
    WHEN COALESCE(r.recent_runs_24h, 0) >= 3
         AND r.recent_failures_24h::numeric / r.recent_runs_24h > 0.25
      THEN 'degraded'
    WHEN ac.last_run_status = 'failed'
         AND COALESCE(r.recent_runs_24h, 0) < 3
         AND COALESCE(r.recent_completed_24h, 0) = 0
      THEN 'degraded'
    ELSE 'healthy'
  END AS health_status
FROM public.agent_config ac
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS recent_runs_24h,
    COUNT(*) FILTER (WHERE status = 'failed')::int AS recent_failures_24h,
    COUNT(*) FILTER (WHERE status = 'completed')::int AS recent_completed_24h
  FROM public.research_tasks rt
  WHERE rt.task_type = ac.agent_type
    AND rt.created_at > now() - interval '24 hours'
    AND rt.status IN ('completed','failed')
) r ON TRUE
LEFT JOIN cron.job cj ON cj.jobname = ac.agent_type;

GRANT SELECT ON public.agent_health TO authenticated;