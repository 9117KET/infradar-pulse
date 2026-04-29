-- Source-first intelligence pipeline foundation

CREATE TYPE public.source_kind AS ENUM (
  'mdb', 'government', 'procurement', 'regulator', 'company', 'news', 'trade_publication', 'satellite', 'manual', 'other'
);

CREATE TYPE public.source_status AS ENUM ('active', 'paused', 'failing', 'retired');
CREATE TYPE public.pipeline_status AS ENUM ('new', 'extracted', 'deduping', 'enriching', 'ready_for_review', 'needs_research', 'approved', 'rejected', 'merged');
CREATE TYPE public.review_item_type AS ENUM ('candidate', 'duplicate', 'enrichment', 'update', 'source_issue', 'quality_issue');
CREATE TYPE public.review_action_type AS ENUM ('approved', 'rejected', 'requested_research', 'merged', 'field_approved', 'field_rejected', 'note');
CREATE TYPE public.update_proposal_status AS ENUM ('pending', 'approved', 'rejected', 'applied');

CREATE TABLE public.source_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  name text NOT NULL,
  kind public.source_kind NOT NULL DEFAULT 'other',
  base_url text,
  countries text[] NOT NULL DEFAULT '{}',
  regions public.project_region[] NOT NULL DEFAULT '{}',
  sectors public.project_sector[] NOT NULL DEFAULT '{}',
  reliability_score integer NOT NULL DEFAULT 60 CHECK (reliability_score BETWEEN 0 AND 100),
  crawl_frequency_minutes integer NOT NULL DEFAULT 1440 CHECK (crawl_frequency_minutes > 0),
  supports_api boolean NOT NULL DEFAULT false,
  supports_rss boolean NOT NULL DEFAULT false,
  supports_sitemap boolean NOT NULL DEFAULT false,
  status public.source_status NOT NULL DEFAULT 'active',
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.raw_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.source_registry(id) ON DELETE SET NULL,
  source_key text,
  url text NOT NULL,
  canonical_url text,
  title text NOT NULL DEFAULT '',
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  extracted_text text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  kind public.source_kind NOT NULL DEFAULT 'other',
  fetch_status text NOT NULL DEFAULT 'fetched',
  extraction_confidence integer NOT NULL DEFAULT 50 CHECK (extraction_confidence BETWEEN 0 AND 100),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_hash),
  UNIQUE (url)
);

CREATE TABLE public.project_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  normalized_name text NOT NULL,
  name text NOT NULL,
  country text NOT NULL DEFAULT '',
  region public.project_region,
  sector public.project_sector,
  stage public.project_stage NOT NULL DEFAULT 'Planned',
  status public.project_status NOT NULL DEFAULT 'Pending',
  value_usd bigint NOT NULL DEFAULT 0,
  value_label text NOT NULL DEFAULT '$0',
  confidence integer NOT NULL DEFAULT 30 CHECK (confidence BETWEEN 0 AND 100),
  risk_score integer NOT NULL DEFAULT 50 CHECK (risk_score BETWEEN 0 AND 100),
  lat double precision,
  lng double precision,
  description text NOT NULL DEFAULT '',
  timeline text,
  source_url text NOT NULL DEFAULT '',
  extracted_claims jsonb NOT NULL DEFAULT '{}'::jsonb,
  duplicate_of uuid REFERENCES public.project_candidates(id) ON DELETE SET NULL,
  duplicate_confidence integer CHECK (duplicate_confidence IS NULL OR duplicate_confidence BETWEEN 0 AND 100),
  pipeline_status public.pipeline_status NOT NULL DEFAULT 'new',
  review_status public.pipeline_status NOT NULL DEFAULT 'ready_for_review',
  discovered_by text NOT NULL DEFAULT 'agent',
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.candidate_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.project_candidates(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES public.raw_evidence(id) ON DELETE CASCADE,
  supports_fields text[] NOT NULL DEFAULT '{}',
  relevance_score integer NOT NULL DEFAULT 60 CHECK (relevance_score BETWEEN 0 AND 100),
  quote text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, evidence_id)
);

CREATE TABLE public.project_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.project_candidates(id) ON DELETE CASCADE,
  evidence_id uuid REFERENCES public.raw_evidence(id) ON DELETE SET NULL,
  field_name text NOT NULL,
  field_value text NOT NULL,
  confidence integer NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  quote text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (project_id IS NOT NULL OR candidate_id IS NOT NULL)
);

CREATE TABLE public.agent_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.research_tasks(id) ON DELETE CASCADE,
  agent_type text NOT NULL,
  event_type text NOT NULL,
  message text NOT NULL DEFAULT '',
  counters jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.project_candidates(id) ON DELETE CASCADE,
  total_score integer NOT NULL DEFAULT 0 CHECK (total_score BETWEEN 0 AND 100),
  source_score integer NOT NULL DEFAULT 0 CHECK (source_score BETWEEN 0 AND 100),
  evidence_score integer NOT NULL DEFAULT 0 CHECK (evidence_score BETWEEN 0 AND 100),
  completeness_score integer NOT NULL DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 100),
  freshness_score integer NOT NULL DEFAULT 0 CHECK (freshness_score BETWEEN 0 AND 100),
  confidence_score integer NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  contradiction_penalty integer NOT NULL DEFAULT 0 CHECK (contradiction_penalty BETWEEN 0 AND 100),
  missing_fields text[] NOT NULL DEFAULT '{}',
  flags text[] NOT NULL DEFAULT '{}',
  recommendation text NOT NULL DEFAULT 'needs_review',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (project_id IS NOT NULL OR candidate_id IS NOT NULL)
);

CREATE TABLE public.review_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type public.review_item_type NOT NULL,
  candidate_id uuid REFERENCES public.project_candidates(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  update_proposal_id uuid,
  action public.review_action_type NOT NULL,
  reason text NOT NULL DEFAULT '',
  field_name text,
  old_value text,
  new_value text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.update_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  proposed_by_agent text NOT NULL DEFAULT 'update-check',
  field_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_id uuid REFERENCES public.raw_evidence(id) ON DELETE SET NULL,
  source_url text,
  confidence integer NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  impact text NOT NULL DEFAULT '',
  status public.update_proposal_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_actions
  ADD CONSTRAINT review_actions_update_proposal_fk
  FOREIGN KEY (update_proposal_id) REFERENCES public.update_proposals(id) ON DELETE CASCADE;

CREATE INDEX idx_raw_evidence_source_key ON public.raw_evidence(source_key);
CREATE INDEX idx_project_candidates_status ON public.project_candidates(review_status, pipeline_status);
CREATE INDEX idx_project_candidates_normalized_name ON public.project_candidates(normalized_name);
CREATE INDEX idx_candidate_evidence_candidate ON public.candidate_evidence_links(candidate_id);
CREATE INDEX idx_project_claims_candidate ON public.project_claims(candidate_id);
CREATE INDEX idx_project_claims_project ON public.project_claims(project_id);
CREATE INDEX idx_agent_run_events_task ON public.agent_run_events(task_id, created_at DESC);
CREATE INDEX idx_quality_scores_candidate ON public.quality_scores(candidate_id, calculated_at DESC);
CREATE INDEX idx_quality_scores_project ON public.quality_scores(project_id, calculated_at DESC);
CREATE INDEX idx_update_proposals_status ON public.update_proposals(status, created_at DESC);

ALTER TABLE public.source_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.update_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read source registry" ON public.source_registry FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can manage source registry" ON public.source_registry FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Service role manages source registry" ON public.source_registry FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Staff can read raw evidence" ON public.raw_evidence FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can manage raw evidence" ON public.raw_evidence FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Service role manages raw evidence" ON public.raw_evidence FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Staff can read project candidates" ON public.project_candidates FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can manage project candidates" ON public.project_candidates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Service role manages project candidates" ON public.project_candidates FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Staff can read candidate evidence" ON public.candidate_evidence_links FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can manage candidate evidence" ON public.candidate_evidence_links FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Service role manages candidate evidence" ON public.candidate_evidence_links FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Staff can read project claims" ON public.project_claims FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can manage project claims" ON public.project_claims FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Service role manages project claims" ON public.project_claims FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Staff can read agent run events" ON public.agent_run_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Service role manages agent run events" ON public.agent_run_events FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Staff can read quality scores" ON public.quality_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can manage quality scores" ON public.quality_scores FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Service role manages quality scores" ON public.quality_scores FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Staff can read review actions" ON public.review_actions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can insert review actions" ON public.review_actions FOR INSERT TO authenticated WITH CHECK ((performed_by = auth.uid() OR performed_by IS NULL) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)));
CREATE POLICY "Service role manages review actions" ON public.review_actions FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Staff can read update proposals" ON public.update_proposals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can manage update proposals" ON public.update_proposals FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Service role manages update proposals" ON public.update_proposals FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.calculate_quality_score(
  p_source_url text,
  p_confidence integer,
  p_description text,
  p_value_usd bigint,
  p_lat double precision,
  p_lng double precision,
  p_evidence_count integer DEFAULT 0,
  p_official_source_count integer DEFAULT 0,
  p_contact_count integer DEFAULT 0,
  p_last_updated timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_source_score integer := 0;
  v_evidence_score integer := 0;
  v_completeness_score integer := 0;
  v_freshness_score integer := 0;
  v_confidence_score integer := LEAST(GREATEST(COALESCE(p_confidence, 0), 0), 100);
  v_total integer := 0;
  v_missing text[] := '{}';
  v_flags text[] := '{}';
  v_recommendation text := 'needs_review';
  v_age_days integer := 0;
BEGIN
  IF p_source_url IS NOT NULL AND trim(p_source_url) LIKE 'http%' AND trim(p_source_url) <> '#' THEN
    v_source_score := 45;
  ELSE
    v_missing := array_append(v_missing, 'source_url');
    v_flags := array_append(v_flags, 'missing_source_url');
  END IF;

  IF p_official_source_count > 0 THEN
    v_source_score := LEAST(100, v_source_score + 35);
  END IF;

  IF p_evidence_count >= 2 THEN
    v_evidence_score := 100;
  ELSIF p_evidence_count = 1 THEN
    v_evidence_score := 55;
  ELSE
    v_missing := array_append(v_missing, 'evidence');
  END IF;

  IF p_description IS NOT NULL AND length(trim(p_description)) >= 80 THEN
    v_completeness_score := v_completeness_score + 25;
  ELSE
    v_missing := array_append(v_missing, 'description');
  END IF;

  IF COALESCE(p_value_usd, 0) > 0 THEN
    v_completeness_score := v_completeness_score + 20;
  ELSE
    v_missing := array_append(v_missing, 'value');
  END IF;

  IF p_contact_count > 0 THEN
    v_completeness_score := v_completeness_score + 25;
  ELSE
    v_missing := array_append(v_missing, 'contact');
  END IF;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL AND NOT (p_lat = 0 AND p_lng = 0) THEN
    v_completeness_score := v_completeness_score + 30;
  ELSE
    v_missing := array_append(v_missing, 'coordinates');
    v_flags := array_append(v_flags, 'weak_geospatial_precision');
  END IF;

  v_age_days := GREATEST(0, floor(extract(epoch from (now() - COALESCE(p_last_updated, now()))) / 86400)::integer);
  IF v_age_days <= 30 THEN
    v_freshness_score := 100;
  ELSIF v_age_days <= 90 THEN
    v_freshness_score := 70;
  ELSIF v_age_days <= 180 THEN
    v_freshness_score := 45;
  ELSE
    v_freshness_score := 20;
    v_flags := array_append(v_flags, 'stale_record');
  END IF;

  v_total := round(
    (v_source_score * 0.30) +
    (v_evidence_score * 0.25) +
    (v_completeness_score * 0.20) +
    (v_freshness_score * 0.10) +
    (v_confidence_score * 0.15)
  )::integer;

  IF NOT (p_source_url IS NOT NULL AND trim(p_source_url) LIKE 'http%' AND trim(p_source_url) <> '#') THEN
    v_total := LEAST(v_total, 30);
  END IF;

  IF v_total >= 85 AND p_evidence_count >= 2 AND p_official_source_count > 0 THEN
    v_recommendation := 'approve';
  ELSIF v_total >= 50 THEN
    v_recommendation := 'review';
  ELSE
    v_recommendation := 'needs_research';
  END IF;

  RETURN jsonb_build_object(
    'total_score', v_total,
    'source_score', v_source_score,
    'evidence_score', v_evidence_score,
    'completeness_score', v_completeness_score,
    'freshness_score', v_freshness_score,
    'confidence_score', v_confidence_score,
    'missing_fields', v_missing,
    'flags', v_flags,
    'recommendation', v_recommendation
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_intelligence_pipeline_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH authorized AS (
    SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'researcher'::public.app_role) AS ok
  ), candidate_counts AS (
    SELECT jsonb_object_agg(review_status::text, count) AS row
    FROM (
      SELECT review_status, count(*)::integer AS count
      FROM public.project_candidates, authorized a
      WHERE a.ok
      GROUP BY review_status
    ) s
  ), source_health AS (
    SELECT jsonb_build_object(
      'total_sources', count(*)::integer,
      'active_sources', count(*) FILTER (WHERE status = 'active')::integer,
      'failing_sources', count(*) FILTER (WHERE status = 'failing')::integer,
      'stale_sources', count(*) FILTER (WHERE last_success_at IS NULL OR last_success_at < now() - interval '7 days')::integer
    ) AS row
    FROM public.source_registry, authorized a
    WHERE a.ok
  ), quality AS (
    SELECT jsonb_build_object(
      'avg_score', COALESCE(round(avg(total_score))::integer, 0),
      'approve_ready', count(*) FILTER (WHERE recommendation = 'approve')::integer,
      'needs_research', count(*) FILTER (WHERE recommendation = 'needs_research')::integer,
      'missing_source', count(*) FILTER (WHERE flags @> ARRAY['missing_source_url']::text[])::integer
    ) AS row
    FROM public.quality_scores, authorized a
    WHERE a.ok
      AND calculated_at >= now() - interval '30 days'
  ), review AS (
    SELECT jsonb_build_object(
      'pending_candidates', count(*) FILTER (WHERE review_status IN ('ready_for_review', 'needs_research'))::integer,
      'high_confidence_pending', count(*) FILTER (WHERE review_status = 'ready_for_review' AND confidence >= 80)::integer,
      'update_proposals', (SELECT count(*)::integer FROM public.update_proposals up, authorized a2 WHERE a2.ok AND up.status = 'pending')
    ) AS row
    FROM public.project_candidates, authorized a
    WHERE a.ok
  ), agent_events AS (
    SELECT jsonb_build_object(
      'events_24h', count(*)::integer,
      'errors_24h', count(*) FILTER (WHERE event_type IN ('error', 'failed'))::integer
    ) AS row
    FROM public.agent_run_events, authorized a
    WHERE a.ok AND created_at >= now() - interval '24 hours'
  )
  SELECT CASE WHEN (SELECT ok FROM authorized) THEN
    jsonb_build_object(
      'candidate_counts', COALESCE((SELECT row FROM candidate_counts), '{}'::jsonb),
      'source_health', COALESCE((SELECT row FROM source_health), '{"total_sources":0,"active_sources":0,"failing_sources":0,"stale_sources":0}'::jsonb),
      'quality', COALESCE((SELECT row FROM quality), '{"avg_score":0,"approve_ready":0,"needs_research":0,"missing_source":0}'::jsonb),
      'review', COALESCE((SELECT row FROM review), '{"pending_candidates":0,"high_confidence_pending":0,"update_proposals":0}'::jsonb),
      'agent_events', COALESCE((SELECT row FROM agent_events), '{"events_24h":0,"errors_24h":0}'::jsonb)
    )
  ELSE
    jsonb_build_object('candidate_counts', '{}'::jsonb, 'source_health', '{}'::jsonb, 'quality', '{}'::jsonb, 'review', '{}'::jsonb, 'agent_events', '{}'::jsonb)
  END;
$$;
