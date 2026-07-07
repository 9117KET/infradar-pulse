-- Official-registry auto-publish + coordinate quality
--
-- 1. projects/candidates gain `provenance` and `coord_precision`; lat/lng
--    become nullable so unknown locations are stored as NULL (off-map) instead
--    of [0,0] "null island".
-- 2. promote_project_candidate (human review path) now stamps
--    provenance='human_verified' and passes NULL coordinates through.
-- 3. New service-role-only auto_promote_official_candidate() lets deterministic
--    official-API ingest agents (World Bank, IFC, ADB, IADB, AIIB, ...) publish
--    directly with provenance='official_registry'. LLM-extracted candidates
--    (AfDB, EBRD, research-agent) keep the human review gate.
-- 4. ingest_cursors table powers automated offset-based backfill runs.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.projects ALTER COLUMN lat DROP NOT NULL;
ALTER TABLE public.projects ALTER COLUMN lng DROP NOT NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS provenance text
    CHECK (provenance IS NULL OR provenance IN ('official_registry', 'human_verified', 'ai_agent')),
  ADD COLUMN IF NOT EXISTS coord_precision text
    CHECK (coord_precision IS NULL OR coord_precision IN ('exact', 'country'));

ALTER TABLE public.project_candidates
  ADD COLUMN IF NOT EXISTS coord_precision text
    CHECK (coord_precision IS NULL OR coord_precision IN ('exact', 'country'));

-- Null-island cleanup: [0,0] came from unknown-country centroid fallbacks.
UPDATE public.projects SET lat = NULL, lng = NULL, coord_precision = NULL
WHERE lat = 0 AND lng = 0;
UPDATE public.project_candidates SET lat = NULL, lng = NULL, coord_precision = NULL
WHERE lat = 0 AND lng = 0;

-- Legacy provenance backfill: AI-generated rows are identifiable; everything
-- else predates provenance tracking and stays NULL (UI shows no badge).
UPDATE public.projects SET provenance = 'ai_agent'
WHERE provenance IS NULL AND ai_generated = true;

CREATE INDEX IF NOT EXISTS idx_projects_provenance ON public.projects(provenance);

-- Audit action for machine promotion (safe to add; only used at runtime).
ALTER TYPE public.review_action_type ADD VALUE IF NOT EXISTS 'auto_published';

-- ---------------------------------------------------------------------------
-- 2. Human promotion path: stamp provenance, pass NULL coords through
-- ---------------------------------------------------------------------------

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
  v_evidence_count integer;
BEGIN
  IF NOT (public.has_role(v_performed_by, 'admin'::public.app_role) OR public.has_role(v_performed_by, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate FROM public.project_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate not found' USING ERRCODE = '22023';
  END IF;

  IF v_candidate.review_status = 'rejected' OR v_candidate.pipeline_status = 'rejected' THEN
    RAISE EXCEPTION 'cannot approve a rejected candidate' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_evidence_count
  FROM public.candidate_evidence_links
  WHERE candidate_id = p_candidate_id;

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
    confidence, risk_score, lat, lng, coord_precision, description, timeline, source_url,
    ai_generated, approved, provenance, last_updated
  ) VALUES (
    v_final_slug,
    v_candidate.name,
    v_candidate.country,
    COALESCE(v_candidate.region::public.project_region, 'MENA'::public.project_region),
    COALESCE(v_candidate.sector::public.project_sector, 'Infrastructure'::public.project_sector),
    COALESCE(v_candidate.stage::public.project_stage, 'Planned'::public.project_stage),
    COALESCE(v_candidate.status::public.project_status, 'Pending'::public.project_status),
    COALESCE(v_candidate.value_usd, 0)::bigint,
    COALESCE(v_candidate.value_label, '$0'),
    CASE WHEN nullif(trim(coalesce(v_candidate.source_url, '')), '') IS NULL THEN LEAST(v_candidate.confidence, 30) ELSE v_candidate.confidence END,
    v_candidate.risk_score,
    v_candidate.lat,
    v_candidate.lng,
    v_candidate.coord_precision,
    COALESCE(v_candidate.description, ''),
    v_candidate.timeline,
    COALESCE(v_candidate.source_url, ''),
    false,
    true,
    'human_verified',
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

  FOR v_claim IN SELECT jsonb_array_elements(jsonb_build_array(v_candidate.extracted_claims->>'borrower', v_candidate.extracted_claims->>'implementing_agency', v_candidate.extracted_claims->>'stakeholder')) LOOP
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

  RETURN jsonb_build_object('project_id', v_project_id, 'already_promoted', false, 'evidence_count', v_evidence_count);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_project_candidate(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.promote_project_candidate(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Machine promotion path for deterministic official registries
-- ---------------------------------------------------------------------------
-- Callable only with the service role key (edge functions). No auth.uid()
-- staff check — instead access is locked down via EXECUTE grants.

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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate not found' USING ERRCODE = '22023';
  END IF;

  IF v_candidate.review_status = 'rejected' OR v_candidate.pipeline_status = 'rejected' THEN
    RAISE EXCEPTION 'cannot auto-publish a rejected candidate' USING ERRCODE = '22023';
  END IF;

  -- Machine path still requires an evidence trail and a real source URL.
  SELECT count(*) INTO v_evidence_count
  FROM public.candidate_evidence_links
  WHERE candidate_id = p_candidate_id;
  IF v_evidence_count = 0 THEN
    RAISE EXCEPTION 'cannot auto-publish candidate without evidence trail' USING ERRCODE = '22023';
  END IF;
  IF nullif(trim(coalesce(v_candidate.source_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'cannot auto-publish candidate without a source URL' USING ERRCODE = '22023';
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
    confidence, risk_score, lat, lng, coord_precision, description, timeline, source_url,
    ai_generated, approved, provenance, last_updated
  ) VALUES (
    v_final_slug,
    v_candidate.name,
    v_candidate.country,
    COALESCE(v_candidate.region::public.project_region, 'MENA'::public.project_region),
    COALESCE(v_candidate.sector::public.project_sector, 'Infrastructure'::public.project_sector),
    COALESCE(v_candidate.stage::public.project_stage, 'Planned'::public.project_stage),
    COALESCE(v_candidate.status::public.project_status, 'Pending'::public.project_status),
    COALESCE(v_candidate.value_usd, 0)::bigint,
    COALESCE(v_candidate.value_label, '$0'),
    v_candidate.confidence,
    v_candidate.risk_score,
    v_candidate.lat,
    v_candidate.lng,
    v_candidate.coord_precision,
    COALESCE(v_candidate.description, ''),
    v_candidate.timeline,
    v_candidate.source_url,
    false,
    true,
    'official_registry',
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

  FOR v_claim IN SELECT jsonb_array_elements(jsonb_build_array(v_candidate.extracted_claims->>'borrower', v_candidate.extracted_claims->>'implementing_agency', v_candidate.extracted_claims->>'stakeholder')) LOOP
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
  VALUES ('candidate', p_candidate_id, v_project_id, 'auto_published', COALESCE(p_reason, ''), NULL);

  INSERT INTO public.project_verification_log (project_id, action, reason, performed_by)
  VALUES (v_project_id, 'auto_published', COALESCE(p_reason, 'Auto-published from official registry ingest'), NULL);

  RETURN jsonb_build_object('project_id', v_project_id, 'already_promoted', false, 'evidence_count', v_evidence_count);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_promote_official_candidate(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_promote_official_candidate(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Backfill cursors
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ingest_cursors (
  agent_key text PRIMARY KEY,
  next_offset integer NOT NULL DEFAULT 0,
  exhausted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ingest_cursors ENABLE ROW LEVEL SECURITY;

-- Edge functions use the service role (bypasses RLS); staff can inspect
-- backfill progress from the dashboard.
DROP POLICY IF EXISTS "Staff can read ingest_cursors" ON public.ingest_cursors;
CREATE POLICY "Staff can read ingest_cursors" ON public.ingest_cursors
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
