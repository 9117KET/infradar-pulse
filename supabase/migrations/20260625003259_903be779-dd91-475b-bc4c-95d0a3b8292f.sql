CREATE OR REPLACE FUNCTION public.slugify_project_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      trim(both '-' FROM regexp_replace(
        regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'),
        '-{2,}', '-', 'g'
      )),
      ''
    ),
    'project-' || substr(md5(coalesce(p_name, random()::text) || clock_timestamp()::text), 1, 8)
  );
$$;

GRANT EXECUTE ON FUNCTION public.slugify_project_name(text) TO authenticated, service_role;