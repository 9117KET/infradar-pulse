CREATE OR REPLACE FUNCTION public.claim_own_pilot_access(p_email text DEFAULT NULL::text, p_environment text DEFAULT 'live'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_config public.pilot_access_config%ROWTYPE;
  v_existing public.pilot_access_grants%ROWTYPE;
  v_taken integer;
  v_seat integer;
  v_email text := public.normalize_email(p_email);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.has_role(v_user_id, 'admin'::public.app_role) OR public.has_role(v_user_id, 'researcher'::public.app_role) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'staff_already_has_access');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pilot_access:' || COALESCE(p_environment, 'live')));

  SELECT * INTO v_config
  FROM public.pilot_access_config
  WHERE environment = COALESCE(p_environment, 'live');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'not_configured');
  END IF;

  SELECT * INTO v_existing
  FROM public.pilot_access_grants
  WHERE user_id = v_user_id AND environment = v_config.environment;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'granted', v_existing.status = 'active' AND v_existing.ends_at > now(),
      'reason', 'existing',
      'seat_number', v_existing.seat_number,
      'ends_at', v_existing.ends_at,
      'status', v_existing.status,
      'duration_days', v_config.duration_days
    );
  END IF;

  IF NOT v_config.enabled THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'disabled');
  END IF;

  SELECT count(*)::integer INTO v_taken
  FROM public.pilot_access_grants
  WHERE environment = v_config.environment
    AND seat_number IS NOT NULL;

  IF v_taken >= v_config.max_seats THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'sold_out', 'used_seats', v_taken, 'max_seats', v_config.max_seats);
  END IF;

  v_seat := v_taken + 1;

  INSERT INTO public.pilot_access_grants (
    user_id, email_normalized, environment, status, starts_at, ends_at, seat_number, grant_source
  ) VALUES (
    v_user_id,
    v_email,
    v_config.environment,
    'active',
    now(),
    now() + make_interval(days => v_config.duration_days),
    v_seat,
    'automatic'
  )
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'granted', true,
    'reason', 'created',
    'seat_number', v_existing.seat_number,
    'ends_at', v_existing.ends_at,
    'max_seats', v_config.max_seats,
    'duration_days', v_config.duration_days
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_own_pilot_access(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_own_pilot_access(text, text) TO authenticated;