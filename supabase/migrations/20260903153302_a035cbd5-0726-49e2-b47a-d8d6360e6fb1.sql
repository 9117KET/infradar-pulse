CREATE OR REPLACE FUNCTION public.candidate_is_auto_approvable(p_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_candidates c
    WHERE c.id = p_candidate_id
      AND c.canonical_project_id IS NULL
      AND c.review_status NOT IN ('rejected','approved')
      AND c.pipeline_status NOT IN ('rejected','approved','merged')
      AND c.source_url ~ '^https?://'
      AND nullif(trim(coalesce(c.name,'')),'') IS NOT NULL
      AND nullif(trim(coalesce(c.country,'')),'') IS NOT NULL
      AND nullif(trim(coalesce(c.sector,'')),'') IS NOT NULL
      AND nullif(trim(coalesce(c.stage,'')),'') IS NOT NULL
      AND c.lat IS NOT NULL AND c.lng IS NOT NULL
      AND length(coalesce(c.description,'')) >= 40
      AND coalesce(c.confidence, 0) >= 60
      AND EXISTS (SELECT 1 FROM public.candidate_evidence_links l WHERE l.candidate_id = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.source_link_checks s
        WHERE s.url = c.source_url AND s.status <> 'ok'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.candidate_is_auto_approvable(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_is_auto_approvable(uuid) TO service_role, postgres;