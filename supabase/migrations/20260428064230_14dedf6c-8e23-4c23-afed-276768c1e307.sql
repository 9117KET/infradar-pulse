CREATE OR REPLACE FUNCTION public.rebuild_agent_config_from_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agent_config (
    agent_type,
    enabled,
    last_run_at,
    last_run_status,
    success_count,
    failure_count,
    updated_at
  )
  WITH counts AS (
    SELECT
      task_type AS agent_type,
      count(*) FILTER (WHERE status = 'completed')::integer AS success_count,
      count(*) FILTER (WHERE status = 'failed')::integer AS failure_count
    FROM public.research_tasks
    WHERE status IN ('completed', 'failed')
    GROUP BY task_type
  ), latest AS (
    SELECT DISTINCT ON (task_type)
      task_type AS agent_type,
      COALESCE(completed_at, created_at) AS last_run_at,
      status::text AS last_run_status
    FROM public.research_tasks
    WHERE status IN ('completed', 'failed', 'running')
    ORDER BY task_type, COALESCE(completed_at, created_at) DESC
  )
  SELECT
    c.agent_type,
    true,
    l.last_run_at,
    l.last_run_status,
    c.success_count,
    c.failure_count,
    now()
  FROM counts c
  LEFT JOIN latest l ON l.agent_type = c.agent_type
  ON CONFLICT (agent_type) DO UPDATE SET
    last_run_at = EXCLUDED.last_run_at,
    last_run_status = EXCLUDED.last_run_status,
    success_count = EXCLUDED.success_count,
    failure_count = EXCLUDED.failure_count,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agent_monitoring_summary(p_recent_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH authorized AS (
    SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'researcher'::public.app_role) AS ok
  ), configs AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(ac) ORDER BY ac.agent_type), '[]'::jsonb) AS rows
    FROM public.agent_config ac, authorized a
    WHERE a.ok
  ), recent AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(rt) ORDER BY rt.created_at DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT id, task_type, status, query, error, result, created_at, completed_at, current_step
      FROM public.research_tasks, authorized a
      WHERE a.ok
      ORDER BY created_at DESC
      LIMIT LEAST(GREATEST(p_recent_limit, 1), 500)
    ) rt
  ), latest AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.task_type), '[]'::jsonb) AS rows
    FROM (
      SELECT DISTINCT ON (task_type)
        id, task_type, status, query, error, result, created_at, completed_at, current_step
      FROM public.research_tasks, authorized a
      WHERE a.ok
      ORDER BY task_type, created_at DESC
    ) t
  ), totals AS (
    SELECT jsonb_build_object(
      'total_runs', count(*) FILTER (WHERE status IN ('completed', 'failed')),
      'completed', count(*) FILTER (WHERE status = 'completed'),
      'failed', count(*) FILTER (WHERE status = 'failed'),
      'running', count(*) FILTER (WHERE status = 'running')
    ) AS row
    FROM public.research_tasks, authorized a
    WHERE a.ok
  )
  SELECT CASE WHEN (SELECT ok FROM authorized) THEN
    jsonb_build_object(
      'agent_configs', (SELECT rows FROM configs),
      'recent_tasks', (SELECT rows FROM recent),
      'latest_tasks', (SELECT rows FROM latest),
      'totals', (SELECT row FROM totals)
    )
  ELSE
    jsonb_build_object('agent_configs', '[]'::jsonb, 'recent_tasks', '[]'::jsonb, 'latest_tasks', '[]'::jsonb, 'totals', jsonb_build_object('total_runs', 0, 'completed', 0, 'failed', 0, 'running', 0))
  END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_agent_config_from_tasks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_agent_monitoring_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_agent_config_from_tasks() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_agent_monitoring_summary(integer) TO authenticated;

SELECT public.rebuild_agent_config_from_tasks();