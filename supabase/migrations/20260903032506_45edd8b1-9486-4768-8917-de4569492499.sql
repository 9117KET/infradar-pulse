CREATE OR REPLACE FUNCTION public.auto_promote_official_candidate(p_candidate_id uuid, p_reason text DEFAULT 'Auto-published from official registry ingest')
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
BEGIN
  SELECT * INTO v_candidate FROM public.project_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate not found' USING ERRCODE = '22023'; END IF;
  IF v_candidate.review_status = 'rejected' OR v_candidate.pipeline_status = 'rejected' THEN
    RAISE EXCEPTION 'cannot auto-publish a rejected candidate' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_evidence_count FROM public.candidate_evidence_links WHERE candidate_id = p_candidate_id;
  IF v_evidence_count = 0 THEN RAISE EXCEPTION 'cannot auto-publish candidate without evidence trail' USING ERRCODE = '22023'; END IF;
  IF nullif(trim(coalesce(v_candidate.source_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'cannot auto-publish candidate without a source URL' USING ERRCODE = '22023';
  END IF;

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
    COALESCE(v_candidate.region::public.project_region, 'MENA'::public.project_region),
    COALESCE(v_candidate.sector::public.project_sector, 'Infrastructure'::public.project_sector),
    COALESCE(v_candidate.stage::public.project_stage, 'Planned'::public.project_stage),
    COALESCE(v_candidate.status::public.project_status, 'Pending'::public.project_status),
    COALESCE(v_candidate.value_usd, 0)::bigint, COALESCE(v_candidate.value_label, '$0'),
    v_candidate.confidence, v_candidate.risk_score, v_candidate.lat, v_candidate.lng, v_candidate.coord_precision,
    COALESCE(v_candidate.description, ''), v_candidate.timeline, v_candidate.source_url, false, true, 'official_registry', now())
  RETURNING id INTO v_project_id;

  INSERT INTO public.evidence_sources (project_id, source, url, type, verified, date, title, description, added_by)
  SELECT v_project_id, COALESCE(sr.name, re.source_key, 'Pipeline Evidence'), re.url,
    CASE WHEN re.kind IN ('mdb', 'government', 'procurement', 'regulator') THEN 'Filing'::public.evidence_type ELSE 'News'::public.evidence_type END,
    re.kind IN ('mdb', 'government', 'procurement', 'regulator'),
    COALESCE(to_char(re.published_at::date, 'YYYY-MM-DD'), to_char(re.created_at::date, 'YYYY-MM-DD')),
    re.title, left(COALESCE(re.summary, ''), 500), 'pipeline'
  FROM public.candidate_evidence_links cel
  JOIN public.raw_evidence re ON re.id = cel.evidence_id
  LEFT JOIN public.source_registry sr ON sr.id = re.source_id
  WHERE cel.candidate_id = p_candidate_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.project_claims (project_id, evidence_id, field_name, field_value, confidence, quote)
  SELECT v_project_id, evidence_id, field_name, field_value, confidence, quote FROM public.project_claims WHERE candidate_id = p_candidate_id;

  FOR v_claim IN SELECT jsonb_array_elements(jsonb_build_array(v_candidate.extracted_claims->>'borrower', v_candidate.extracted_claims->>'implementing_agency', v_candidate.extracted_claims->>'stakeholder')) LOOP
    v_stakeholder := trim(both '"' from v_claim::text);
    IF v_stakeholder IS NOT NULL AND v_stakeholder <> '' AND v_stakeholder <> 'null' THEN
      INSERT INTO public.project_stakeholders (project_id, name) VALUES (v_project_id, v_stakeholder) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  UPDATE public.project_candidates SET canonical_project_id = v_project_id, review_status = 'approved', pipeline_status = 'approved', updated_at = now() WHERE id = p_candidate_id;
  INSERT INTO public.review_actions (item_type, candidate_id, project_id, action, reason, performed_by)
  VALUES ('candidate', p_candidate_id, v_project_id, 'auto_published', COALESCE(p_reason, ''), NULL);
  INSERT INTO public.project_verification_log (project_id, action, reason, performed_by)
  VALUES (v_project_id, 'auto_published', COALESCE(p_reason, 'Auto-published from official registry ingest'), NULL);
  RETURN jsonb_build_object('project_id', v_project_id, 'already_promoted', false, 'evidence_count', v_evidence_count);
END;
$$;
REVOKE ALL ON FUNCTION public.auto_promote_official_candidate(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_promote_official_candidate(uuid, text) TO service_role;