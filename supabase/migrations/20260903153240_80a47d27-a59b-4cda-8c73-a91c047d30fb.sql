CREATE OR REPLACE FUNCTION public.auto_approve_candidate_backlog(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row record;
  v_promoted integer := 0;
  v_failed integer := 0;
  v_provenance text;
  v_errors text[] := ARRAY[]::text[];
BEGIN
  FOR v_row IN
    SELECT c.id, c.discovered_by, c.name
    FROM public.project_candidates c
    WHERE c.canonical_project_id IS NULL
      AND c.review_status NOT IN ('rejected','approved')
      AND c.pipeline_status NOT IN ('rejected','approved','merged')
    ORDER BY c.value_usd DESC NULLS LAST, c.created_at ASC
    LIMIT greatest(1, least(coalesce(p_limit, 200), 1000))
  LOOP
    IF NOT public.candidate_is_auto_approvable(v_row.id) THEN
      CONTINUE;
    END IF;
    v_provenance := CASE WHEN coalesce(v_row.discovered_by,'') LIKE '%-ingest%' THEN 'official_registry' ELSE 'ai_agent' END;
    BEGIN
      PERFORM public.auto_promote_official_candidate(
        v_row.id,
        'Auto-approved: verified source URL, evidence trail and complete core fields',
        v_provenance
      );
      v_promoted := v_promoted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      IF array_length(v_errors, 1) IS NULL OR array_length(v_errors, 1) < 10 THEN
        v_errors := v_errors || (coalesce(v_row.name,'?') || ': ' || SQLSTATE || ' ' || SQLERRM);
      END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('promoted', v_promoted, 'failed', v_failed, 'errors', to_jsonb(v_errors));
END;
$$;

REVOKE ALL ON FUNCTION public.auto_approve_candidate_backlog(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_approve_candidate_backlog(integer) TO service_role, postgres;