CREATE TYPE public.project_recheck_finding_type AS ENUM (
  'missing_source',
  'missing_contact',
  'low_confidence',
  'stale_record',
  'high_risk'
);

CREATE TYPE public.project_recheck_severity AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TYPE public.project_recheck_status AS ENUM ('open', 'in_review', 'resolved', 'dismissed');

CREATE TABLE public.project_recheck_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  finding_type public.project_recheck_finding_type NOT NULL,
  severity public.project_recheck_severity NOT NULL DEFAULT 'medium',
  status public.project_recheck_status NOT NULL DEFAULT 'open',
  quality_score integer,
  confidence_snapshot integer,
  risk_snapshot integer,
  source_count integer,
  contact_count integer,
  missing_fields text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT 'project-recheck-agent',
  resolved_reason text,
  resolved_by uuid,
  resolved_at timestamptz,
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_recheck_quality_score_range CHECK (quality_score IS NULL OR (quality_score BETWEEN 0 AND 100)),
  CONSTRAINT project_recheck_confidence_range CHECK (confidence_snapshot IS NULL OR (confidence_snapshot BETWEEN 0 AND 100)),
  CONSTRAINT project_recheck_risk_range CHECK (risk_snapshot IS NULL OR (risk_snapshot BETWEEN 0 AND 100)),
  CONSTRAINT project_recheck_source_count_nonnegative CHECK (source_count IS NULL OR source_count >= 0),
  CONSTRAINT project_recheck_contact_count_nonnegative CHECK (contact_count IS NULL OR contact_count >= 0),
  CONSTRAINT project_recheck_resolved_consistency CHECK (
    (status IN ('resolved', 'dismissed') AND resolved_at IS NOT NULL)
    OR (status IN ('open', 'in_review') AND resolved_at IS NULL)
  )
);

CREATE UNIQUE INDEX uq_project_recheck_open_per_type
ON public.project_recheck_findings(project_id, finding_type)
WHERE status IN ('open', 'in_review');

CREATE INDEX idx_project_recheck_status_severity
ON public.project_recheck_findings(status, severity, created_at DESC);

CREATE INDEX idx_project_recheck_project_status
ON public.project_recheck_findings(project_id, status, updated_at DESC);

ALTER TABLE public.project_recheck_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read project recheck findings"
ON public.project_recheck_findings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can manage project recheck findings"
ON public.project_recheck_findings
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Service role manages project recheck findings"
ON public.project_recheck_findings
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.set_project_recheck_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_recheck_updated_at
BEFORE UPDATE ON public.project_recheck_findings
FOR EACH ROW
EXECUTE FUNCTION public.set_project_recheck_updated_at();

CREATE OR REPLACE FUNCTION public.get_existing_project_recheck_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH authorized AS (
    SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'researcher'::public.app_role) AS ok
  ),
  scoped AS (
    SELECT * FROM public.project_recheck_findings
    WHERE (SELECT ok FROM authorized)
  ),
  counts_by_status AS (
    SELECT status::text AS key, count(*)::integer AS value
    FROM scoped
    GROUP BY status
  ),
  counts_by_severity AS (
    SELECT severity::text AS key, count(*)::integer AS value
    FROM scoped
    GROUP BY severity
  ),
  counts_by_type AS (
    SELECT finding_type::text AS key, count(*)::integer AS value
    FROM scoped
    GROUP BY finding_type
  )
  SELECT CASE
    WHEN (SELECT ok FROM authorized) THEN
      jsonb_build_object(
        'total', (SELECT count(*)::integer FROM scoped),
        'open_total', (SELECT count(*)::integer FROM scoped WHERE status IN ('open', 'in_review')),
        'critical_open', (SELECT count(*)::integer FROM scoped WHERE status IN ('open', 'in_review') AND severity = 'critical'),
        'high_open', (SELECT count(*)::integer FROM scoped WHERE status IN ('open', 'in_review') AND severity = 'high'),
        'by_status', COALESCE((SELECT jsonb_object_agg(key, value) FROM counts_by_status), '{}'::jsonb),
        'by_severity', COALESCE((SELECT jsonb_object_agg(key, value) FROM counts_by_severity), '{}'::jsonb),
        'by_type', COALESCE((SELECT jsonb_object_agg(key, value) FROM counts_by_type), '{}'::jsonb)
      )
    ELSE
      jsonb_build_object(
        'total', 0,
        'open_total', 0,
        'critical_open', 0,
        'high_open', 0,
        'by_status', '{}'::jsonb,
        'by_severity', '{}'::jsonb,
        'by_type', '{}'::jsonb
      )
  END;
$$;