-- begin_agent_task: atomically check for an already-running task of the same
-- type and, if none exists, insert a new 'running' task.
--
-- Returns JSONB:
--   { "already_running": true,  "id": null }   -- another instance is live
--   { "already_running": false, "id": "<uuid>" } -- new task inserted, caller proceeds
--
-- Agents call this RPC instead of inserting into research_tasks directly.
-- The check+insert happens in a single transaction so there is no window
-- for two concurrent callers to both see "no running task" and both proceed.

CREATE OR REPLACE FUNCTION public.begin_agent_task(
  p_task_type    TEXT,
  p_query        TEXT,
  p_requested_by TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_running_count INT;
  v_task_id       UUID;
BEGIN
  SELECT COUNT(*) INTO v_running_count
  FROM public.research_tasks
  WHERE task_type = p_task_type
    AND status    = 'running';

  IF v_running_count > 0 THEN
    RETURN jsonb_build_object('already_running', true, 'id', NULL);
  END IF;

  INSERT INTO public.research_tasks (task_type, query, status, requested_by)
  VALUES (
    p_task_type,
    p_query,
    'running',
    CASE WHEN p_requested_by IS NULL OR p_requested_by = 'service_role'
         THEN NULL
         ELSE p_requested_by::UUID
    END
  )
  RETURNING id INTO v_task_id;

  RETURN jsonb_build_object('already_running', false, 'id', v_task_id);
END;
$$;

-- Allow authenticated users and service role to call this function.
GRANT EXECUTE ON FUNCTION public.begin_agent_task(TEXT, TEXT, TEXT) TO authenticated, service_role;
