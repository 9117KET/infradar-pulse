CREATE OR REPLACE FUNCTION public.get_public_pilot_access_counter(p_environment text DEFAULT 'live')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.pilot_access_config%ROWTYPE;
  v_used integer;
BEGIN
  SELECT * INTO v_config
  FROM public.pilot_access_config
  WHERE environment = COALESCE(p_environment, 'live');

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'configured', false,
      'environment', COALESCE(p_environment, 'live'),
      'enabled', false,
      'max_seats', 100,
      'used_seats', 0,
      'remaining_seats', 100,
      'duration_days', 30
    );
  END IF;

  SELECT count(*)::integer INTO v_used
  FROM public.pilot_access_grants
  WHERE environment = v_config.environment
    AND seat_number IS NOT NULL;

  RETURN jsonb_build_object(
    'configured', true,
    'environment', v_config.environment,
    'enabled', v_config.enabled,
    'max_seats', v_config.max_seats,
    'used_seats', v_used,
    'remaining_seats', GREATEST(v_config.max_seats - v_used, 0),
    'duration_days', v_config.duration_days
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_pilot_access_counter(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_pilot_access_counter(text) TO anon, authenticated;