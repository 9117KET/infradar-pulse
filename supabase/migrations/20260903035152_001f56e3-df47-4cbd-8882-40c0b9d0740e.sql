CREATE OR REPLACE FUNCTION public.upsert_canonical_contact(
  p_name text,
  p_title text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_organization text DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_contact_type text DEFAULT 'general',
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_source text DEFAULT 'contact-finder',
  p_source_url text DEFAULT NULL,
  p_confidence integer DEFAULT 60,
  p_discovered_by text DEFAULT 'contact-finder'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_email text;
  v_phone text;
  v_id uuid;
BEGIN
  v_norm := trim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g'));
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  IF length(v_norm) < 2 OR (v_email IS NULL AND v_phone IS NULL) THEN
    RETURN NULL;
  END IF;

  SELECT c.id INTO v_id
  FROM public.contacts c
  WHERE c.normalized_name = v_norm
    AND c.company_id IS NOT DISTINCT FROM p_company_id
    AND (
      (v_email IS NOT NULL AND lower(coalesce(c.email, '')) = v_email)
      OR (v_phone IS NOT NULL AND c.phone = v_phone)
    )
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.contacts (
      name, normalized_name, title, company_id, organization, project_id,
      contact_type, email, phone, country, source, source_url, confidence,
      discovered_by
    ) VALUES (
      trim(p_name), v_norm, nullif(trim(coalesce(p_title, '')), ''), p_company_id,
      nullif(trim(coalesce(p_organization, '')), ''), p_project_id,
      CASE WHEN p_contact_type IN ('contractor','government','financier','consultant','owner','general')
        THEN p_contact_type ELSE 'general' END,
      v_email, v_phone, nullif(trim(coalesce(p_country, '')), ''),
      nullif(trim(coalesce(p_source, '')), ''),
      CASE WHEN p_source_url ~ '^https?://' THEN trim(p_source_url) ELSE NULL END,
      greatest(0, least(100, coalesce(p_confidence, 60))),
      nullif(trim(coalesce(p_discovered_by, 'contact-finder')), '')
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.contacts c SET
      title = coalesce(nullif(trim(coalesce(p_title, '')), ''), c.title),
      organization = coalesce(nullif(trim(coalesce(p_organization, '')), ''), c.organization),
      project_id = coalesce(c.project_id, p_project_id),
      contact_type = CASE WHEN c.contact_type = 'general' AND p_contact_type IN ('contractor','government','financier','consultant','owner')
        THEN p_contact_type ELSE c.contact_type END,
      email = coalesce(c.email, v_email),
      phone = coalesce(c.phone, v_phone),
      country = coalesce(c.country, nullif(trim(coalesce(p_country, '')), '')),
      source = coalesce(nullif(trim(coalesce(p_source, '')), ''), c.source),
      source_url = CASE WHEN p_source_url ~ '^https?://' THEN p_source_url ELSE c.source_url END,
      confidence = greatest(c.confidence, greatest(0, least(100, coalesce(p_confidence, 60)))),
      discovered_by = coalesce(nullif(trim(coalesce(p_discovered_by, '')), ''), c.discovered_by)
    WHERE c.id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_canonical_contact(text, text, uuid, text, uuid, text, text, text, text, text, text, integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_canonical_contact(text, text, uuid, text, uuid, text, text, text, text, text, text, integer, text) TO service_role;