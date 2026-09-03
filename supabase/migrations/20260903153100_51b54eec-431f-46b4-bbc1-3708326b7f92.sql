DROP FUNCTION IF EXISTS public.auto_promote_official_candidate(uuid, text);

CREATE OR REPLACE FUNCTION public.auto_promote_official_candidate(
  p_candidate_id uuid,
  p_reason text DEFAULT 'Auto-published from official registry ingest',
  p_provenance text DEFAULT 'official_registry'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_candidate public.project_candidates%ROWTYPE;
  v_project_id uuid;
  v_slug text;
  v_suffix integer := 0;
  v_final_slug text;
  v_claim jsonb;
  v_stakeholder text;
  v_evidence_count integer;
  v_provenance text := CASE WHEN p_provenance IN ('official_registry','human_verified','ai_agent') THEN p_provenance ELSE 'ai_agent' END;
BEGIN
  SELECT * INTO v_candidate FROM public.project_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate not found' USING ERRCODE = '22023'; END IF;
  IF v_candidate.review_status = 'rejected' OR v_candidate.pipeline_status = 'rejected' THEN
    RAISE EXCEPTION 'cannot auto-publish a rejected candidate' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_evidence_count FROM public.candidate_evidence_links WHERE candidate_id = p_candidate_id;
  IF v_evidence_count = 0 THEN RAISE EXCEPTION 'cannot auto-publish candidate without evidence trail' USING ERRCODE = '22023'; END IF;
  IF nullif(trim(coalesce(v_candidate.source_url, '')), '') IS NULL THEN RAISE EXCEPTION 'cannot auto-publish candidate without a source URL' USING ERRCODE = '22023'; END IF;
  IF v_candidate.canonical_project_id IS NOT NULL THEN
    UPDATE public.project_candidates SET review_status = 'approved', pipeline_status = 'approved', updated_at = now() WHERE id = p_candidate_id;
    RETURN jsonb_build_object('project_id', v_candidate.canonical_project_id, 'already_promoted', true);
  END IF;
  v_slug := public.slugify_project_name(v_candidate.name);
  v_final_slug := v_slug;
  WHILE EXISTS (SELECT 1 FROM public.projects WHERE slug = v_final_slug) LOOP
    v_suffix := v_suffix + 1;
    v_final_slug := v_slug || '-' || v_suffix::text;
  END LOOP;
  INSERT INTO public.projects (slug, name, country, region, sector, stage, status, value_usd, value_label, confidence, risk_score, lat, lng, coord_precision, description, timeline, source_url, ai_generated, approved, provenance, last_updated)
  VALUES (v_final_slug, v_candidate.name, v_candidate.country,
    COALESCE(v_candidate.region::public.project_region, 'MENA'::public.project_region), COALESCE(v_candidate.sector::public.project_sector, 'Infrastructure'::public.project_sector), COALESCE(v_candidate.stage::public.project_stage, 'Planned'::public.project_stage), COALESCE(v_candidate.status::public.project_status, 'Pending'::public.project_status), COALESCE(v_candidate.value_usd, 0)::bigint, COALESCE(v_candidate.value_label, '$0'), v_candidate.confidence, v_candidate.risk_score, v_candidate.lat, v_candidate.lng, v_candidate.coord_precision, COALESCE(v_candidate.description, ''), v_candidate.timeline, v_candidate.source_url, v_provenance = 'ai_agent', true, v_provenance, now())
  RETURNING id INTO v_project_id;
  INSERT INTO public.evidence_sources (project_id, source, url, type, verified, date, title, description, added_by)
  SELECT v_project_id, COALESCE(sr.name, re.source_key, 'Pipeline Evidence'), re.url, CASE WHEN re.kind IN ('mdb', 'government', 'procurement', 'regulator') THEN 'Filing'::public.evidence_type ELSE 'News'::public.evidence_type END, re.kind IN ('mdb', 'government', 'procurement', 'regulator'), COALESCE(to_char(re.published_at::date, 'YYYY-MM-DD'), to_char(re.created_at::date, 'YYYY-MM-DD')), re.title, left(COALESCE(re.summary, ''), 500), 'pipeline'
  FROM public.candidate_evidence_links cel JOIN public.raw_evidence re ON re.id = cel.evidence_id LEFT JOIN public.source_registry sr ON sr.id = re.source_id WHERE cel.candidate_id = p_candidate_id ON CONFLICT DO NOTHING;
  INSERT INTO public.project_claims (project_id, evidence_id, field_name, field_value, confidence, quote)
  SELECT v_project_id, evidence_id, field_name, field_value, confidence, quote FROM public.project_claims WHERE candidate_id = p_candidate_id;
  FOR v_claim IN SELECT jsonb_array_elements(jsonb_build_array(v_candidate.extracted_claims->>'borrower', v_candidate.extracted_claims->>'implementing_agency', v_candidate.extracted_claims->>'stakeholder')) LOOP
    v_stakeholder := trim(both '"' from v_claim::text);
    IF v_stakeholder IS NOT NULL AND v_stakeholder <> '' AND v_stakeholder <> 'null' THEN INSERT INTO public.project_stakeholders (project_id, name) VALUES (v_project_id, v_stakeholder) ON CONFLICT DO NOTHING; END IF;
  END LOOP;
  UPDATE public.project_candidates SET canonical_project_id = v_project_id, review_status = 'approved', pipeline_status = 'approved', updated_at = now() WHERE id = p_candidate_id;
  INSERT INTO public.review_actions (item_type, candidate_id, project_id, action, reason, performed_by) VALUES ('candidate', p_candidate_id, v_project_id, 'auto_published', COALESCE(p_reason, ''), NULL);
  INSERT INTO public.project_verification_log (project_id, action, reason, performed_by) VALUES (v_project_id, 'auto_published', COALESCE(p_reason, 'Auto-published by pipeline'), NULL);
  RETURN jsonb_build_object('project_id', v_project_id, 'already_promoted', false, 'evidence_count', v_evidence_count);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_promote_official_candidate(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_promote_official_candidate(uuid, text, text) TO service_role;

-- Shared eligibility rule: working source link, evidence trail, core fields, decent confidence.
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
GRANT EXECUTE ON FUNCTION public.candidate_is_auto_approvable(uuid) TO service_role;

-- Batch drain of the existing review queue using the same rule.
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
    END;
  END LOOP;
  RETURN jsonb_build_object('promoted', v_promoted, 'failed', v_failed);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_approve_candidate_backlog(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_approve_candidate_backlog(integer) TO service_role;