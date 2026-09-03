ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS contact_cursor_contact_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_cursor_contact_id uuid;

CREATE OR REPLACE FUNCTION public.canonicalize_contact_batch(
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'companies_upserted', v_companies,
    'contacts_upserted', v_contacts,
    'roles_upserted', v_roles,
    'next_created_at', v_last_created_at,
    'next_id', v_last_id,
    'exhausted', v_processed < v_batch_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.canonicalize_contact_batch(timestamptz, uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonicalize_contact_batch(timestamptz, uuid, integer) TO service_role;