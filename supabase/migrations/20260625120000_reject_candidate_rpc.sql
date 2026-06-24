-- Reject a pipeline candidate.
--
-- The Review Queue (src/pages/dashboard/ReviewQueue.tsx) already calls this RPC,
-- but it was never defined, so the Reject button on pipeline candidates threw at
-- runtime. This mirrors the hardened promote_project_candidate (migration
-- 20260521213952): staff-only, row-locked, and it records a rejection signature
-- in review_actions so the candidate can never re-surface via a future agent run.

DROP FUNCTION IF EXISTS public.reject_project_candidate(uuid, text);
DROP FUNCTION IF EXISTS public.reject_project_candidate(uuid);

CREATE OR REPLACE FUNCTION public.reject_project_candidate(p_candidate_id uuid, p_reason text DEFAULT 'Rejected from verification workbench')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_candidate public.project_candidates%ROWTYPE;
  v_performed_by uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_performed_by, 'admin'::public.app_role) OR public.has_role(v_performed_by, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate FROM public.project_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate not found' USING ERRCODE = '22023';
  END IF;

  -- Idempotent: a candidate that is already rejected stays rejected.
  IF v_candidate.review_status = 'rejected' OR v_candidate.pipeline_status = 'rejected' THEN
    RETURN jsonb_build_object('candidate_id', p_candidate_id, 'rejected', true, 'already_rejected', true);
  END IF;

  UPDATE public.project_candidates
  SET review_status = 'rejected',
      pipeline_status = 'rejected',
      updated_at = now()
  WHERE id = p_candidate_id;

  INSERT INTO public.review_actions (item_type, candidate_id, action, reason, performed_by)
  VALUES ('candidate', p_candidate_id, 'rejected', COALESCE(p_reason, ''), v_performed_by);

  RETURN jsonb_build_object('candidate_id', p_candidate_id, 'rejected', true, 'already_rejected', false);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_project_candidate(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_project_candidate(uuid, text) TO authenticated;
