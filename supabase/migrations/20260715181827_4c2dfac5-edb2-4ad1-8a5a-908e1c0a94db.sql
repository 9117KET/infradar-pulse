CREATE OR REPLACE FUNCTION public.promote_project_candidate(p_candidate_id uuid, p_reason text DEFAULT 'Approved from verification workbench'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_candidate public.project_candidates%ROWTYPE;
  v_project_id uuid;
  v_slug text;
  v_suffix integer := 0;
  v_final_slug text;
  v_claim jsonb;
  v_stakeholder text;
  v_performed_by uuid := auth.uid();
  v_evidence_count integer;
BEGIN
  IF NOT (public.has_role(v_performed_by, 'admin'::public.app_role) OR public.has_role(v_performed_by, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate FROM public.project_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate not found' USING ERRCODE = '22023'; END IF;

  IF v_candidate.review_status = 'rejected' OR v_candidate.pipeline_status = 'rejected' THEN
    RAISE EXCEPTION 'cannot approve a rejected candidate' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_evidence_count FROM public.candidate_evidence_links WHERE candidate_id = p_candidate_id;
  IF v_evidence_count = 0 THEN
    RAISE EXCEPTION 'cannot approve candidate without evidence trail (no candidate_evidence_links rows)' USING ERRCODE = '22023';
  END IF;

  IF v_candidate.canonical_project_id IS NOT NULL THEN
    UPDATE public.project_candidates
    SET review_status = 'approved', pipeline_status = 'approved', updated_at = now()
    WHERE id = p_candidate_id;
    RETURN jsonb_build_object('project_id', v_candidate.canonical_project_id, 'already_promoted', true);
  END IF;

  v_slug := public.slugify_project_name(v_candidate.name);
  v_final_slug := v_slug;
  WHILE EXISTS (SELECT 1 FROM public.projects WHERE slug = v_final_slug) LOOP
    v_suffix := v_suffix + 1;
    v_final_slug := v_slug || '-' || v_suffix::text;
  END LOOP;

  INSERT INTO public.projects (
    slug, name, country, region, sector, stage, status, value_usd, value_label,
    confidence, risk_score, lat, lng, description, timeline, source_url,
    ai_generated, approved, last_updated
  ) VALUES (
    v_final_slug,
    v_candidate.name,
    v_candidate.country,
    COALESCE(public.safe_cast_project_region(v_candidate.region), 'MENA'::public.project_region),
    COALESCE(public.safe_cast_project_sector(v_candidate.sector), 'Infrastructure'::public.project_sector),
    COALESCE(public.safe_cast_project_stage(v_candidate.stage), 'Planned'::public.project_stage),
    COALESCE(public.safe_cast_project_status(v_candidate.status), 'Pending'::public.project_status),
    COALESCE(v_candidate.value_usd, 0)::bigint,
    COALESCE(v_candidate.value_label, '$0'),
    CASE WHEN nullif(trim(coalesce(v_candidate.source_url, '')), '') IS NULL THEN LEAST(v_candidate.confidence, 30) ELSE v_candidate.confidence END,
    v_candidate.risk_score,
    COALESCE(v_candidate.lat, 0),
    COALESCE(v_candidate.lng, 0),
    COALESCE(v_candidate.description, ''),
    v_candidate.timeline,
    COALESCE(v_candidate.source_url, ''),
    false,
    true,
    now()
  ) RETURNING id INTO v_project_id;

  INSERT INTO public.evidence_sources (project_id, source, url, type, verified, date, title, description, added_by)
  SELECT
    v_project_id,
    COALESCE(sr.name, re.source_key, 'Pipeline Evidence'),
    re.url,
    CASE WHEN re.kind IN ('mdb', 'government', 'procurement', 'regulator') THEN 'Filing'::public.evidence_type ELSE 'News'::public.evidence_type END,
    re.kind IN ('mdb', 'government', 'procurement', 'regulator'),
    COALESCE(to_char(re.published_at::date, 'YYYY-MM-DD'), to_char(re.created_at::date, 'YYYY-MM-DD')),
    re.title,
    left(COALESCE(re.summary, ''), 500),
    'pipeline'
  FROM public.candidate_evidence_links cel
  JOIN public.raw_evidence re ON re.id = cel.evidence_id
  LEFT JOIN public.source_registry sr ON sr.id = re.source_id
  WHERE cel.candidate_id = p_candidate_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.project_claims (project_id, evidence_id, field_name, field_value, confidence, quote)
  SELECT v_project_id, evidence_id, field_name, field_value, confidence, quote
  FROM public.project_claims WHERE candidate_id = p_candidate_id;

  FOR v_claim IN SELECT jsonb_array_elements(jsonb_build_array(
    v_candidate.extracted_claims->>'borrower',
    v_candidate.extracted_claims->>'implementing_agency',
    v_candidate.extracted_claims->>'stakeholder'
  )) LOOP
    v_stakeholder := trim(BOTH '"' FROM v_claim::text);
    IF v_stakeholder IS NOT NULL AND v_stakeholder <> '' AND v_stakeholder <> 'null' THEN
      INSERT INTO public.project_stakeholders (project_id, name)
      VALUES (v_project_id, v_stakeholder)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  UPDATE public.project_candidates
  SET review_status = 'approved', pipeline_status = 'approved',
      canonical_project_id = v_project_id, updated_at = now()
  WHERE id = p_candidate_id;

  INSERT INTO public.review_actions (item_type, candidate_id, project_id, action, reason, performed_by)
  VALUES ('candidate', p_candidate_id, v_project_id, 'approved', p_reason, v_performed_by);

  RETURN jsonb_build_object('project_id', v_project_id, 'already_promoted', false);
END;
$function$;