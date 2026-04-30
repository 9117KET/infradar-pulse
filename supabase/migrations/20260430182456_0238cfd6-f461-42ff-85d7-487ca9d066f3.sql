-- Timeout-aware lock + manual reset for agent tasks

CREATE OR REPLACE FUNCTION public.begin_agent_task(p_task_type text, p_query text, p_requested_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_timeout interval;
  v_running_count INT;
  v_task_id UUID;
BEGIN
  -- Long-running ingest agents get a 6h grace, others 30 min.
  v_timeout := CASE
    WHEN p_task_type LIKE '%-ingest' OR p_task_type IN ('dataset-refresh','report-agent','digest-agent','executive-briefing')
      THEN interval '6 hours'
    ELSE interval '30 minutes'
  END;

  -- Auto-expire stale running rows so cron is not blocked forever.
  UPDATE public.research_tasks
  SET status = 'failed',
      error  = COALESCE(NULLIF(error, ''), '') ||
               CASE WHEN COALESCE(error, '') = '' THEN '' ELSE ' | ' END ||
               '[auto-expired stale lock after ' || v_timeout::text || ']',
      completed_at = now()
  WHERE task_type = p_task_type
    AND status = 'running'
    AND created_at < now() - v_timeout;

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
$function$;

-- Admin RPC: force-clear all running rows for an agent so a new run can start.
CREATE OR REPLACE FUNCTION public.reset_stuck_agent_task(p_agent_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.research_tasks
  SET status = 'failed',
      error = COALESCE(NULLIF(error, ''), '') ||
              CASE WHEN COALESCE(error, '') = '' THEN '' ELSE ' | ' END ||
              '[manually reset by staff]',
      completed_at = now()
  WHERE task_type = p_agent_type
    AND status = 'running';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.rebuild_agent_config_from_tasks();

  RETURN jsonb_build_object('reset_count', v_count, 'agent_type', p_agent_type);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reset_stuck_agent_task(text) TO authenticated;

-- One-shot cleanup of currently stuck rows so the dashboard reflects reality immediately.
UPDATE public.research_tasks
SET status = 'failed',
    error = COALESCE(NULLIF(error, ''), '') ||
            CASE WHEN COALESCE(error, '') = '' THEN '' ELSE ' | ' END ||
            '[auto-expired during lock-timeout migration]',
    completed_at = now()
WHERE status = 'running'
  AND (
    (task_type LIKE '%-ingest' OR task_type IN ('dataset-refresh','report-agent','digest-agent','executive-briefing'))
      AND created_at < now() - interval '6 hours'
    OR
    (task_type NOT LIKE '%-ingest' AND task_type NOT IN ('dataset-refresh','report-agent','digest-agent','executive-briefing'))
      AND created_at < now() - interval '30 minutes'
  );

-- Refresh agent_config so last_run_status reflects the cleanup.
SELECT public.rebuild_agent_config_from_tasks();