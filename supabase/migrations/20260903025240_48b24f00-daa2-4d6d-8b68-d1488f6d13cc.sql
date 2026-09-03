-- ===========================================================================
-- Phase 1: bulk backfill queue
-- ===========================================================================
CREATE TABLE public.backfill_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_key text NOT NULL,
  agent_type text NOT NULL,
  agent_function text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_size integer NOT NULL DEFAULT 500,
  cursor_offset integer NOT NULL DEFAULT 0,
  fetched_count integer NOT NULL DEFAULT 0,
  total_estimate integer,
  state text NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 100,
  consecutive_errors integer NOT NULL DEFAULT 0,
  last_error text,
  last_run_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT backfill_jobs_state_check CHECK (state IN ('pending','running','paused','completed','failed')),
  CONSTRAINT backfill_jobs_source_agent_key UNIQUE (source_key, agent_type)
);

GRANT SELECT ON public.backfill_jobs TO authenticated;
GRANT ALL ON public.backfill_jobs TO service_role;

ALTER TABLE public.backfill_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view backfill jobs"
  ON public.backfill_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher'));

CREATE INDEX idx_backfill_jobs_state ON public.backfill_jobs (state, priority, last_run_at);

-- ===========================================================================
-- Phase 2: companies
-- ===========================================================================
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  normalized_name text NOT NULL,
  company_type text NOT NULL DEFAULT 'unknown',
  country text,
  region text,
  sectors text[] NOT NULL DEFAULT '{}',
  website text,
  description text,
  registry_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_urls text[] NOT NULL DEFAULT '{}',
  confidence integer NOT NULL DEFAULT 40,
  project_count integer NOT NULL DEFAULT 0,
  total_value_usd bigint NOT NULL DEFAULT 0,
  discovered_by text NOT NULL DEFAULT 'ingest',
  merged_into uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  enriched_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT companies_type_check CHECK (company_type IN (
    'contractor','developer','financier','agency','consultant','supplier','operator','unknown'
  )),
  CONSTRAINT companies_confidence_check CHECK (confidence BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX companies_normalized_country_key
  ON public.companies (normalized_name, COALESCE(country, ''));
CREATE INDEX idx_companies_country ON public.companies (country);
CREATE INDEX idx_companies_type ON public.companies (company_type);
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX idx_companies_name_trgm ON public.companies USING gin (normalized_name extensions.gin_trgm_ops);

GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view companies"
  ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can manage companies"
  ON public.companies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher'));

-- Company ↔ project roles
CREATE TABLE public.company_project_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.project_candidates(id) ON DELETE CASCADE,
  project_name text NOT NULL,
  role text NOT NULL DEFAULT 'participant',
  value_usd bigint,
  source_url text,
  source_key text,
  awarded_at date,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_cpr_company ON public.company_project_roles (company_id);
CREATE INDEX idx_cpr_project ON public.company_project_roles (project_id);
CREATE UNIQUE INDEX cpr_unique_link
  ON public.company_project_roles (company_id, COALESCE(project_id, candidate_id, '00000000-0000-0000-0000-000000000000'::uuid), role);

GRANT SELECT ON public.company_project_roles TO authenticated;
GRANT ALL ON public.company_project_roles TO service_role;

ALTER TABLE public.company_project_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view company roles"
  ON public.company_project_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can manage company roles"
  ON public.company_project_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher'));

-- ===========================================================================
-- Phase 3: entity-level contacts
-- ===========================================================================
CREATE TABLE public.contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  normalized_name text NOT NULL,
  title text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  organization text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  contact_type text NOT NULL DEFAULT 'general',
  email text,
  phone text,
  country text,
  source text NOT NULL DEFAULT 'public_registry',
  source_url text,
  confidence integer NOT NULL DEFAULT 40,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamp with time zone,
  link_status text NOT NULL DEFAULT 'unchecked',
  discovered_by text NOT NULL DEFAULT 'ingest',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT contacts_confidence_check CHECK (confidence BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX contacts_dedupe_key
  ON public.contacts (normalized_name, COALESCE(lower(email), ''), COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX idx_contacts_company ON public.contacts (company_id);
CREATE INDEX idx_contacts_project ON public.contacts (project_id);

GRANT SELECT ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Paid or staff users can view contacts"
  ON public.contacts FOR SELECT TO authenticated
  USING (public.has_paid_contact_access(auth.uid(), 'live'::text));
CREATE POLICY "Staff can manage contacts"
  ON public.contacts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher'));

-- ===========================================================================
-- Shared updated_at triggers
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_backfill_jobs_updated BEFORE UPDATE ON public.backfill_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===========================================================================
-- Company upsert helper (deterministic, called from ingest agents)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.normalize_company_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      lower(coalesce(p_name, '')),
      '\y(ltd|limited|llc|inc|incorporated|corp|corporation|plc|gmbh|ag|s\.?a\.?|sa|sas|srl|spa|bv|nv|pty|pte|jsc|ojsc|pjsc|co|company|group|holdings|holding|international)\y',
      ' ', 'g'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.upsert_company(
  p_name text,
  p_country text DEFAULT NULL,
  p_type text DEFAULT 'unknown',
  p_source_url text DEFAULT NULL,
  p_sector text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_discovered_by text DEFAULT 'ingest'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_id uuid;
BEGIN
  v_norm := public.normalize_company_name(p_name);
  IF v_norm IS NULL OR length(v_norm) < 3 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.companies (name, normalized_name, country, region, company_type, sectors, source_urls, discovered_by)
  VALUES (
    trim(p_name), v_norm, nullif(trim(coalesce(p_country, '')), ''), nullif(trim(coalesce(p_region, '')), ''),
    COALESCE(p_type, 'unknown'),
    CASE WHEN p_sector IS NULL THEN '{}'::text[] ELSE ARRAY[p_sector] END,
    CASE WHEN p_source_url IS NULL THEN '{}'::text[] ELSE ARRAY[p_source_url] END,
    p_discovered_by
  )
  ON CONFLICT (normalized_name, COALESCE(country, '')) DO UPDATE
    SET sectors = (
          SELECT ARRAY(SELECT DISTINCT unnest(public.companies.sectors || CASE WHEN p_sector IS NULL THEN '{}'::text[] ELSE ARRAY[p_sector] END))
        ),
        source_urls = (
          SELECT ARRAY(SELECT DISTINCT unnest(public.companies.source_urls || CASE WHEN p_source_url IS NULL THEN '{}'::text[] ELSE ARRAY[p_source_url] END))
        ),
        company_type = CASE WHEN public.companies.company_type = 'unknown' THEN COALESCE(p_type, 'unknown') ELSE public.companies.company_type END,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_company(text, text, text, text, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_company(text, text, text, text, text, text, text) TO service_role;