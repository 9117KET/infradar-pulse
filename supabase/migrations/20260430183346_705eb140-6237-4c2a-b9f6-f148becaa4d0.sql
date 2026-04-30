-- 1. source_registry
CREATE TABLE IF NOT EXISTS public.source_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'mdb',
  base_url text,
  reliability_score integer NOT NULL DEFAULT 80,
  crawl_frequency_minutes integer NOT NULL DEFAULT 1440,
  supports_api boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.source_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage source_registry" ON public.source_registry
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role));

-- 2. raw_evidence
CREATE TABLE IF NOT EXISTS public.raw_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.source_registry(id) ON DELETE SET NULL,
  source_key text NOT NULL,
  url text NOT NULL UNIQUE,
  canonical_url text,
  title text,
  published_at timestamptz,
  content_hash text,
  extracted_text text,
  summary text,
  kind text NOT NULL DEFAULT 'mdb',
  fetch_status text NOT NULL DEFAULT 'fetched',
  extraction_confidence integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.raw_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage raw_evidence" ON public.raw_evidence
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role));

-- 3. project_candidates
CREATE TABLE IF NOT EXISTS public.project_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name text NOT NULL,
  name text NOT NULL,
  country text,
  region text,
  sector text,
  stage text,
  status text,
  value_usd numeric,
  value_label text,
  confidence integer NOT NULL DEFAULT 0,
  risk_score integer NOT NULL DEFAULT 40,
  lat double precision,
  lng double precision,
  description text,
  timeline text,
  source_url text,
  extracted_claims jsonb NOT NULL DEFAULT '{}'::jsonb,
  pipeline_status text NOT NULL DEFAULT 'needs_research',
  review_status text NOT NULL DEFAULT 'needs_research',
  discovered_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_candidates_lookup ON public.project_candidates(normalized_name, country, discovered_by);
ALTER TABLE public.project_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage project_candidates" ON public.project_candidates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role));

-- 4. candidate_evidence_links
CREATE TABLE IF NOT EXISTS public.candidate_evidence_links (
  candidate_id uuid NOT NULL REFERENCES public.project_candidates(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES public.raw_evidence(id) ON DELETE CASCADE,
  supports_fields text[] NOT NULL DEFAULT '{}',
  relevance_score integer NOT NULL DEFAULT 50,
  quote text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, evidence_id)
);
ALTER TABLE public.candidate_evidence_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage candidate_evidence_links" ON public.candidate_evidence_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role));

-- 5. project_claims
CREATE TABLE IF NOT EXISTS public.project_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.project_candidates(id) ON DELETE CASCADE,
  evidence_id uuid REFERENCES public.raw_evidence(id) ON DELETE SET NULL,
  field_name text NOT NULL,
  field_value text,
  confidence integer NOT NULL DEFAULT 0,
  quote text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage project_claims" ON public.project_claims
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role));

-- 6. quality_scores
CREATE TABLE IF NOT EXISTS public.quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.project_candidates(id) ON DELETE CASCADE,
  total_score integer NOT NULL DEFAULT 0,
  source_score integer NOT NULL DEFAULT 0,
  evidence_score integer NOT NULL DEFAULT 0,
  completeness_score integer NOT NULL DEFAULT 0,
  freshness_score integer NOT NULL DEFAULT 0,
  confidence_score integer NOT NULL DEFAULT 0,
  missing_fields text[] NOT NULL DEFAULT '{}',
  flags text[] NOT NULL DEFAULT '{}',
  recommendation text NOT NULL DEFAULT 'review',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage quality_scores" ON public.quality_scores
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role));

-- 7. update_proposals
CREATE TABLE IF NOT EXISTS public.update_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  proposed_by_agent text NOT NULL,
  field_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text,
  confidence integer NOT NULL DEFAULT 0,
  impact text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.update_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage update_proposals" ON public.update_proposals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role));

-- 8. digests
CREATE TABLE IF NOT EXISTS public.digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id uuid,
  title text NOT NULL,
  summary text,
  markdown text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ready',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_digests_user ON public.digests(user_id, created_at DESC);
ALTER TABLE public.digests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own digests" ON public.digests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(),'admin'::public.app_role)
         OR public.has_role(auth.uid(),'researcher'::public.app_role));
CREATE POLICY "Users can update own digests" ON public.digests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Staff and users can insert digests" ON public.digests
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role) OR user_id = auth.uid());