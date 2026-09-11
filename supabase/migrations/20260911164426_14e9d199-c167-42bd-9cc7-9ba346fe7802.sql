CREATE OR REPLACE FUNCTION public._coerce_sector(p text)
 RETURNS project_sector
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE s text := lower(coalesce(p, ''));
BEGIN
  BEGIN
    RETURN p::public.project_sector;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF s ~ '(semiconductor|chip fab|wafer|foundry|fab plant|advanced packaging)' THEN
    RETURN 'Semiconductors'::public.project_sector;
  ELSIF s ~ '(gigafactory|battery|bess|energy storage|storage plant)' THEN
    RETURN 'Battery & Storage'::public.project_sector;
  ELSIF s ~ '(nuclear|reactor|\msmr\M|uranium enrich)' THEN
    RETURN 'Nuclear'::public.project_sector;
  ELSIF s ~ '(hydrogen|ammonia|electrolys)' THEN
    RETURN 'Hydrogen'::public.project_sector;
  ELSIF s ~ '(satellite|spaceport|launch site|ground station|space )' THEN
    RETURN 'Space & Satellite'::public.project_sector;
  ELSIF s ~ '(defence|defense|military|naval base|air base)' THEN
    RETURN 'Defence & Security'::public.project_sector;
  ELSIF s ~ '(data cent|hyperscale|colocation)' THEN
    RETURN 'Data Centers'::public.project_sector;
  ELSIF s ~ '(artificial intelligence|\mai\M|gpu|compute campus)' THEN
    RETURN 'AI Infrastructure'::public.project_sector;
  END IF;

  RETURN 'Infrastructure'::public.project_sector;
END $function$;