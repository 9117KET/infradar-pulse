ALTER TABLE public.research_tasks
  ADD COLUMN IF NOT EXISTS current_step TEXT;

ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_status TEXT,
  ADD COLUMN IF NOT EXISTS success_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_duration_ms INT;

CREATE INDEX IF NOT EXISTS idx_research_tasks_task_created
  ON public.research_tasks (task_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.begin_agent_task(
  p_task_type TEXT,
  p_query TEXT,
  p_requested_by TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_running_count INT;
  v_task_id UUID;
BEGIN
  SELECT COUNT(*) INTO v_running_count
  FROM public.research_tasks
  WHERE task_type = p_task_type
    AND status = 'running';

  IF v_running_count > 0 THEN
    RETURN jsonb_build_object('already_running', true, 'id', NULL);
  END IF;

  INSERT INTO public.research_tasks (task_type, query, status, requested_by)
  VALUES (
    p_task_type,
    p_query,
    'running',
    CASE
      WHEN p_requested_by IS NULL OR p_requested_by = '' OR p_requested_by = 'service_role' THEN NULL
      ELSE p_requested_by::UUID
    END
  )
  RETURNING id INTO v_task_id;

  RETURN jsonb_build_object('already_running', false, 'id', v_task_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_agent_run(
  p_agent_type TEXT,
  p_status TEXT,
  p_duration_ms INT DEFAULT NULL
) RETURNS VOID
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
    last_duration_ms,
    success_count,
    failure_count
  )
  VALUES (
    p_agent_type,
    true,
    now(),
    p_status,
    p_duration_ms,
    CASE WHEN p_status = 'completed' THEN 1 ELSE 0 END,
    CASE WHEN p_status = 'failed' THEN 1 ELSE 0 END
  )
  ON CONFLICT (agent_type) DO UPDATE SET
    last_run_at = now(),
    last_run_status = p_status,
    last_duration_ms = COALESCE(p_duration_ms, public.agent_config.last_duration_ms),
    success_count = public.agent_config.success_count + CASE WHEN p_status = 'completed' THEN 1 ELSE 0 END,
    failure_count = public.agent_config.failure_count + CASE WHEN p_status = 'failed' THEN 1 ELSE 0 END,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agent_scheduler_activity()
RETURNS TABLE(
  task_type TEXT,
  last_scheduler_run TIMESTAMPTZ,
  scheduler_runs INTEGER,
  scheduler_failures INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  WITH mapped_runs AS (
    SELECT
      CASE j.jobname
        WHEN 'research-agent' THEN 'discovery'
        WHEN 'update-checker' THEN 'update-check'
        WHEN 'risk-scorer' THEN 'risk-scoring'
        WHEN 'world-bank-ingest' THEN 'world-bank-ingest'
        WHEN 'ifc-ingest' THEN 'ifc-ingest'
        WHEN 'adb-ingest' THEN 'adb-ingest'
        WHEN 'afdb-ingest' THEN 'afdb-ingest'
        WHEN 'ebrd-ingest' THEN 'ebrd-ingest'
        WHEN 'iadb-ingest' THEN 'iadb-ingest'
        WHEN 'aiib-ingest' THEN 'aiib-ingest'
        WHEN 'infradar-iadb-ingest' THEN 'iadb-ingest'
        WHEN 'infradar-aiib-ingest' THEN 'aiib-ingest'
        WHEN 'dataset-refresh-agent' THEN 'dataset-refresh'
        WHEN 'dataset-refresh' THEN 'dataset-refresh'
        ELSE j.jobname
      END AS task_type,
      d.status,
      d.start_time
    FROM cron.job j
    JOIN cron.job_run_details d ON d.jobid = j.jobid
    WHERE j.jobname <> 'process-email-queue'
  )
  SELECT
    mr.task_type,
    max(mr.start_time) AS last_scheduler_run,
    count(*)::integer AS scheduler_runs,
    count(*) FILTER (WHERE mr.status <> 'succeeded')::integer AS scheduler_failures
  FROM mapped_runs mr
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'researcher'::public.app_role)
  GROUP BY mr.task_type
  ORDER BY mr.task_type;
$$;

REVOKE ALL ON FUNCTION public.begin_agent_task(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_agent_run(TEXT, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_agent_scheduler_activity() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.begin_agent_task(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finish_agent_run(TEXT, TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_agent_scheduler_activity() TO authenticated;