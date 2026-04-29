CREATE OR REPLACE FUNCTION public.slugify_project_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(p_name, 'project')), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.promote_project_candidate(p_candidate_id uuid, p_reason text DEFAULT 'Approved from verification workbench')
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
  v_performed_by uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_performed_by, 'admin'::public.app_role) OR public.has_role(v_performed_by, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate
  FROM public.project_candidates
  WHERE id = p_candidate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate not found' USING ERRCODE = '22023';
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
    COALESCE(v_candidate.region, 'MENA'::public.project_region),
    COALESCE(v_candidate.sector, 'Infrastructure'::public.project_sector),
    v_candidate.stage,
    v_candidate.status,
    v_candidate.value_usd,
    v_candidate.value_label,
    CASE WHEN nullif(trim(v_candidate.source_url), '') IS NULL THEN LEAST(v_candidate.confidence, 30) ELSE v_candidate.confidence END,
    v_candidate.risk_score,
    COALESCE(v_candidate.lat, 0),
    COALESCE(v_candidate.lng, 0),
    v_candidate.description,
    v_candidate.timeline,
    v_candidate.source_url,
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
    COALESCE(to_char(re.published_at::date, 'YYYY-MM-DD'), to_char(re.fetched_at::date, 'YYYY-MM-DD')),
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
  FROM public.project_claims
  WHERE candidate_id = p_candidate_id;

  FOR v_claim IN SELECT jsonb_array_elements(jsonb_build_array(v_candidate.extracted_claims->>'borrower', v_candidate.extracted_claims->>'implementing_agency')) LOOP
    v_stakeholder := trim(both '"' from v_claim::text);
    IF v_stakeholder IS NOT NULL AND v_stakeholder <> '' AND v_stakeholder <> 'null' THEN
      INSERT INTO public.project_stakeholders (project_id, name)
      VALUES (v_project_id, v_stakeholder)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  UPDATE public.project_candidates
  SET canonical_project_id = v_project_id,
      review_status = 'approved',
      pipeline_status = 'approved',
      updated_at = now()
  WHERE id = p_candidate_id;

  INSERT INTO public.review_actions (item_type, candidate_id, project_id, action, reason, performed_by)
  VALUES ('candidate', p_candidate_id, v_project_id, 'approved', COALESCE(p_reason, ''), v_performed_by);

  INSERT INTO public.project_verification_log (project_id, action, reason, performed_by)
  VALUES (v_project_id, 'approved', COALESCE(p_reason, 'Approved from verification workbench'), v_performed_by);

  RETURN jsonb_build_object('project_id', v_project_id, 'already_promoted', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_update_proposal(p_update_proposal_id uuid, p_reason text DEFAULT 'Approved update proposal')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_proposal public.update_proposals%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_key text;
  v_value jsonb;
  v_updates jsonb := '{}'::jsonb;
  v_performed_by uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_performed_by, 'admin'::public.app_role) OR public.has_role(v_performed_by, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_proposal FROM public.update_proposals WHERE id = p_update_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal not found' USING ERRCODE = '22023'; END IF;
  IF v_proposal.status NOT IN ('pending', 'approved') THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'proposal_not_pending');
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = v_proposal.project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'project not found' USING ERRCODE = '22023'; END IF;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(v_proposal.field_changes) LOOP
    IF v_key IN ('stage', 'status', 'confidence', 'source_url', 'last_updated') THEN
      v_updates := v_updates || jsonb_build_object(v_key, v_value);
      INSERT INTO public.project_updates (project_id, field_changed, old_value, new_value, source)
      VALUES (
        v_project.id,
        v_key,
        COALESCE(to_jsonb(v_project)->>v_key, ''),
        trim(both '"' from v_value::text),
        'Approved update proposal'
      );
    END IF;
  END LOOP;

  UPDATE public.projects
  SET stage = COALESCE((v_updates->>'stage')::public.project_stage, stage),
      status = COALESCE((v_updates->>'status')::public.project_status, status),
      confidence = COALESCE((v_updates->>'confidence')::integer, confidence),
      source_url = COALESCE(v_updates->>'source_url', source_url),
      last_updated = now()
  WHERE id = v_project.id;

  UPDATE public.update_proposals
  SET status = 'applied', reviewed_by = v_performed_by, reviewed_at = now()
  WHERE id = p_update_proposal_id;

  INSERT INTO public.review_actions (item_type, project_id, update_proposal_id, action, reason, performed_by)
  VALUES ('update', v_project.id, p_update_proposal_id, 'approved', COALESCE(p_reason, ''), v_performed_by);

  RETURN jsonb_build_object('applied', true, 'project_id', v_project.id);
END;
$$;
