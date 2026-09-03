-- 1) Cooldown / scan bookkeeping on projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_contact_scan_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_projects_last_contact_scan ON public.projects (last_contact_scan_at NULLS FIRST);

-- 2) Resilient canonicalization: per-row exception handling so one bad row cannot freeze the cursor
CREATE OR REPLACE FUNCTION public.canonicalize_contact_batch(
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_company_id uuid;
  v_contact_id uuid;
  v_source_url text;
  v_role text;
  v_company_type text;
  v_processed integer := 0;
  v_companies integer := 0;
  v_contacts integer := 0;
  v_roles integer := 0;
  v_skipped integer := 0;
  v_last_error text;
  v_last_created_at timestamptz := p_after_created_at;
  v_last_id uuid := p_after_id;
  v_batch_limit integer := greatest(1, least(coalesce(p_limit, 300), 500));
BEGIN
  FOR r IN
    SELECT pc.id, pc.created_at, pc.project_id, pc.name, pc.role, pc.organization,
           pc.phone, pc.email, pc.contact_type, pc.source, pc.source_url,
           p.name AS project_name, p.country, p.region::text AS region,
           p.sector::text AS sector, p.source_url AS project_source_url,
           p.value_usd
    FROM public.project_contacts pc
    JOIN public.projects p ON p.id = pc.project_id
    WHERE (
      p_after_created_at IS NULL
      OR pc.created_at > p_after_created_at
      OR (pc.created_at = p_after_created_at AND pc.id > p_after_id)
    )
    ORDER BY pc.created_at ASC, pc.id ASC
    LIMIT v_batch_limit
  LOOP
    v_processed := v_processed + 1;
    v_last_created_at := r.created_at;
    v_last_id := r.id;

    BEGIN
      v_source_url := CASE
        WHEN coalesce(r.source_url, '') ~ '^https?://' THEN trim(r.source_url)
        WHEN coalesce(r.project_source_url, '') ~ '^https?://' THEN trim(r.project_source_url)
        ELSE NULL
      END;
      v_role := CASE lower(coalesce(r.contact_type, ''))
        WHEN 'contractor' THEN 'contractor'
        WHEN 'government' THEN 'government'
        WHEN 'financier' THEN 'financier'
        WHEN 'consultant' THEN 'consultant'
        WHEN 'owner' THEN 'owner'
        ELSE coalesce(nullif(trim(r.role), ''), 'participant')
      END;
      v_company_type := CASE lower(coalesce(r.contact_type, ''))
        WHEN 'contractor' THEN 'contractor'
        WHEN 'government' THEN 'agency'
        WHEN 'financier' THEN 'financier'
        WHEN 'consultant' THEN 'consultant'
        ELSE 'unknown'
      END;

      IF nullif(trim(coalesce(r.organization, '')), '') IS NOT NULL THEN
        v_company_id := public.upsert_company(
          r.organization, r.country, v_company_type, v_source_url, r.sector,
          r.region, 'contact-finder'
        );
        IF v_company_id IS NOT NULL THEN
          v_companies := v_companies + 1;
          IF public.upsert_company_project_role(
            v_company_id, r.project_id, NULL, r.project_name, v_role,
            r.value_usd, v_source_url, 'project_contacts', NULL
          ) IS NOT NULL THEN
            v_roles := v_roles + 1;
          END IF;
        END IF;
      ELSE
        v_company_id := NULL;
      END IF;

      IF nullif(trim(coalesce(r.name, '')), '') IS NOT NULL
         AND (nullif(trim(coalesce(r.email, '')), '') IS NOT NULL
              OR nullif(trim(coalesce(r.phone, '')), '') IS NOT NULL)
         AND v_source_url IS NOT NULL THEN
        v_contact_id := public.upsert_canonical_contact(
          r.name, r.role, v_company_id, r.organization, r.project_id,
          coalesce(nullif(trim(r.contact_type), ''), 'general'), r.email, r.phone,
          r.country, coalesce(nullif(trim(r.source), ''), 'public_registry'),
          v_source_url, 75, 'contact-finder'
        );
        IF v_contact_id IS NOT NULL THEN
          v_contacts := v_contacts + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      v_last_error := left(SQLSTATE || ': ' || SQLERRM, 300);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'companies_upserted', v_companies,
    'contacts_upserted', v_contacts,
    'roles_upserted', v_roles,
    'skipped', v_skipped,
    'last_error', v_last_error,
    'next_created_at', v_last_created_at,
    'next_id', v_last_id,
    'exhausted', v_processed < v_batch_limit
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.canonicalize_contact_batch(timestamptz, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonicalize_contact_batch(timestamptz, uuid, integer) TO service_role;

-- 3) Discovery work queue over ALL approved projects lacking a reachable contact
CREATE OR REPLACE FUNCTION public.contact_discovery_queue(
  p_limit integer DEFAULT 10,
  p_cooldown_hours integer DEFAULT 168
)
RETURNS TABLE (
  id uuid,
  name text,
  country text,
  region text,
  sector text,
  source_url text,
  value_usd bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, p.country, p.region::text, p.sector::text, p.source_url, p.value_usd
  FROM public.projects p
  WHERE p.approved = true
    AND (
      p.last_contact_scan_at IS NULL
      OR p.last_contact_scan_at < now() - make_interval(hours => greatest(1, coalesce(p_cooldown_hours, 168)))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.project_contacts pc
      WHERE pc.project_id = p.id
        AND nullif(trim(coalesce(pc.name, '')), '') IS NOT NULL
        AND (nullif(trim(coalesce(pc.email, '')), '') IS NOT NULL
             OR nullif(trim(coalesce(pc.phone, '')), '') IS NOT NULL)
    )
  ORDER BY p.last_contact_scan_at NULLS FIRST, p.value_usd DESC NULLS LAST, p.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 10), 100));
$function$;

REVOKE EXECUTE ON FUNCTION public.contact_discovery_queue(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contact_discovery_queue(integer, integer) TO service_role;

-- 4) Organisation-level contact reuse
CREATE OR REPLACE FUNCTION public.attach_org_contacts(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted integer := 0;
  v_projects integer := 0;
BEGIN
  WITH targets AS (
    SELECT p.id AS project_id
    FROM public.projects p
    WHERE p.approved = true
      AND NOT EXISTS (
        SELECT 1 FROM public.project_contacts pc
        WHERE pc.project_id = p.id
          AND (nullif(trim(coalesce(pc.email, '')), '') IS NOT NULL
               OR nullif(trim(coalesce(pc.phone, '')), '') IS NOT NULL)
      )
    ORDER BY p.value_usd DESC NULLS LAST
    LIMIT greatest(1, least(coalesce(p_limit, 200), 1000))
  ),
  candidates AS (
    SELECT DISTINCT ON (t.project_id, c.name, c.organization)
      t.project_id, c.name, c.title AS role, c.organization, c.phone, c.email,
      c.contact_type, c.source_url, c.confidence
    FROM targets t
    JOIN public.company_project_roles cpr ON cpr.project_id = t.project_id
    JOIN public.contacts c ON c.company_id = cpr.company_id
    WHERE c.source_url ~ '^https?://'
      AND (nullif(trim(coalesce(c.email, '')), '') IS NOT NULL
           OR nullif(trim(coalesce(c.phone, '')), '') IS NOT NULL)
    ORDER BY t.project_id, c.name, c.organization, c.confidence DESC NULLS LAST
  ),
  ins AS (
    INSERT INTO public.project_contacts (
      project_id, name, role, organization, phone, email, contact_type,
      source, source_url, added_by
    )
    SELECT project_id, name, coalesce(role, 'Organisation contact'), organization,
           phone, email,
           CASE WHEN contact_type IN ('contractor','government','financier','consultant','owner','general')
                THEN contact_type ELSE 'general' END,
           'organisation', source_url, 'ai'
    FROM candidates
    ON CONFLICT (project_id, name, organization) DO NOTHING
    RETURNING project_id
  )
  SELECT count(*), count(DISTINCT project_id) INTO v_inserted, v_projects FROM ins;

  RETURN jsonb_build_object('contacts_attached', v_inserted, 'projects_covered', v_projects);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.attach_org_contacts(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_org_contacts(integer) TO service_role;

-- 5) Coverage summary for the Agents Hub
CREATE OR REPLACE FUNCTION public.get_contact_coverage_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'approved_projects', count(*) FILTER (WHERE p.approved),
    'with_reachable_contact', count(*) FILTER (
      WHERE p.approved AND EXISTS (
        SELECT 1 FROM public.project_contacts pc
        WHERE pc.project_id = p.id
          AND (nullif(trim(coalesce(pc.email, '')), '') IS NOT NULL
               OR nullif(trim(coalesce(pc.phone, '')), '') IS NOT NULL))),
    'with_multiple_sources', count(*) FILTER (
      WHERE p.approved AND (
        SELECT count(*) FROM public.evidence_sources e WHERE e.project_id = p.id) > 1),
    'discovery_queue', count(*) FILTER (
      WHERE p.approved AND NOT EXISTS (
        SELECT 1 FROM public.project_contacts pc
        WHERE pc.project_id = p.id
          AND (nullif(trim(coalesce(pc.email, '')), '') IS NOT NULL
               OR nullif(trim(coalesce(pc.phone, '')), '') IS NOT NULL))),
    'canonical_contacts', (SELECT count(*) FROM public.contacts),
    'canonical_companies', (SELECT count(*) FROM public.companies)
  )
  FROM public.projects p;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_contact_coverage_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contact_coverage_summary() TO authenticated, service_role;