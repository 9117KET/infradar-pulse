CREATE OR REPLACE FUNCTION public.get_public_platform_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'projects', (SELECT count(*) FROM public.projects WHERE approved),
    'countries', (
      SELECT count(DISTINCT btrim(country))
      FROM public.projects
      WHERE approved
        AND nullif(btrim(coalesce(country, '')), '') IS NOT NULL
        AND btrim(country) !~* '^(regional|global|world|multiple|various|multinational|n/?a|unknown|tbd)$'
        AND btrim(country) !~ ','
    ),
    'companies', (SELECT count(*) FROM public.companies),
    'contacts', (SELECT count(*) FROM public.contacts),
    'projects_with_contacts', (
      SELECT count(DISTINCT pc.project_id)
      FROM public.project_contacts pc
      JOIN public.projects p ON p.id = pc.project_id AND p.approved
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.get_public_platform_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_platform_counts() TO anon, authenticated, service_role;