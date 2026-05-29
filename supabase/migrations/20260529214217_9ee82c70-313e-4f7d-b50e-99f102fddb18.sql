-- Track validation results for every source URL we surface to users
CREATE TABLE IF NOT EXISTS public.source_link_checks (
  url text PRIMARY KEY,
  status text NOT NULL,
  http_code integer,
  error text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_link_checks_status_checked_idx
  ON public.source_link_checks (status, checked_at DESC);

GRANT SELECT ON public.source_link_checks TO authenticated;
GRANT ALL ON public.source_link_checks TO service_role;

ALTER TABLE public.source_link_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read source link checks"
  ON public.source_link_checks
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'researcher'::app_role));

CREATE POLICY "Service role manages source link checks"
  ON public.source_link_checks
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Cleanup function: removes AI-sourced broken URLs from evidence, projects,
-- contacts, and insights. Returns counts. Defaults to dry-run.
CREATE OR REPLACE FUNCTION public.cleanup_broken_sources(dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  evidence_removed integer := 0;
  evidence_unverified integer := 0;
  projects_url_cleared integer := 0;
  projects_confidence_lowered integer := 0;
  contacts_url_cleared integer := 0;
  insights_sources_cleaned integer := 0;
  insights_unpublished integer := 0;
  broken_urls text[];
BEGIN
  -- Snapshot of currently-broken URLs
  SELECT array_agg(url) INTO broken_urls
  FROM public.source_link_checks
  WHERE status = 'broken';

  IF broken_urls IS NULL OR array_length(broken_urls, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'dry_run', dry_run,
      'broken_urls', 0,
      'note', 'No broken URLs recorded. Run link-validator first.'
    );
  END IF;

  -- Evidence: count what we'd delete vs un-verify
  SELECT COUNT(*) INTO evidence_removed
  FROM public.evidence_sources
  WHERE url = ANY(broken_urls) AND added_by = 'ai';

  SELECT COUNT(*) INTO evidence_unverified
  FROM public.evidence_sources
  WHERE url = ANY(broken_urls) AND added_by <> 'ai' AND verified = true;

  -- Projects with broken source_url
  SELECT COUNT(*) INTO projects_url_cleared
  FROM public.projects
  WHERE source_url = ANY(broken_urls);

  -- Contacts with broken source_url
  SELECT COUNT(*) INTO contacts_url_cleared
  FROM public.project_contacts
  WHERE source_url = ANY(broken_urls);

  -- Insights whose sources array contains any broken URL
  SELECT COUNT(*) INTO insights_sources_cleaned
  FROM public.insights
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(sources) s
    WHERE s->>'url' = ANY(broken_urls)
  );

  IF NOT dry_run THEN
    DELETE FROM public.evidence_sources
    WHERE url = ANY(broken_urls) AND added_by = 'ai';

    UPDATE public.evidence_sources
    SET verified = false
    WHERE url = ANY(broken_urls) AND added_by <> 'ai' AND verified = true;

    UPDATE public.projects
    SET source_url = '',
        confidence = GREATEST(0, confidence - 10)
    WHERE source_url = ANY(broken_urls)
    RETURNING 1 INTO projects_confidence_lowered;

    UPDATE public.project_contacts
    SET source_url = NULL
    WHERE source_url = ANY(broken_urls);

    UPDATE public.insights i
    SET sources = COALESCE(
          (SELECT jsonb_agg(s)
             FROM jsonb_array_elements(i.sources) s
             WHERE NOT (s->>'url' = ANY(broken_urls))),
          '[]'::jsonb
        ),
        published = CASE
          WHEN (SELECT COUNT(*) FROM jsonb_array_elements(i.sources) s
                  WHERE NOT (s->>'url' = ANY(broken_urls))) = 0 THEN false
          ELSE i.published
        END
    WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(i.sources) s
      WHERE s->>'url' = ANY(broken_urls)
    );

    SELECT COUNT(*) INTO insights_unpublished
    FROM public.insights
    WHERE jsonb_array_length(sources) = 0 AND published = false;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', dry_run,
    'broken_urls', array_length(broken_urls, 1),
    'evidence_removed', evidence_removed,
    'evidence_unverified', evidence_unverified,
    'projects_url_cleared', projects_url_cleared,
    'contacts_url_cleared', contacts_url_cleared,
    'insights_sources_cleaned', insights_sources_cleaned,
    'insights_now_unpublished', insights_unpublished
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_broken_sources(boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.cleanup_broken_sources(boolean) TO service_role;