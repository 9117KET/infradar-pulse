CREATE OR REPLACE FUNCTION public.claim_own_pilot_access(p_email text DEFAULT NULL, p_environment text DEFAULT 'live')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      'status', v_existing.status
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
    'max_seats', v_config.max_seats
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_pilot_access(p_user_id uuid, p_email text DEFAULT NULL, p_environment text DEFAULT 'live')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.pilot_access_config%ROWTYPE;
  v_existing public.pilot_access_grants%ROWTYPE;
  v_taken integer;
  v_seat integer;
  v_email text := public.normalize_email(p_email);
  v_admin uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user is required' USING ERRCODE = '22023';
  END IF;

  IF public.has_role(p_user_id, 'admin'::public.app_role) OR public.has_role(p_user_id, 'researcher'::public.app_role) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'staff_already_has_access');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pilot_access:' || COALESCE(p_environment, 'live')));

  SELECT * INTO v_config
  FROM public.pilot_access_config
  WHERE environment = COALESCE(p_environment, 'live');

  IF NOT FOUND THEN
    INSERT INTO public.pilot_access_config (environment, enabled, max_seats, duration_days)
    VALUES (COALESCE(p_environment, 'live'), true, 100, 30)
    RETURNING * INTO v_config;
  END IF;

  SELECT * INTO v_existing
  FROM public.pilot_access_grants
  WHERE user_id = p_user_id AND environment = v_config.environment;

  IF FOUND THEN
    UPDATE public.pilot_access_grants
    SET status = 'active',
        starts_at = LEAST(starts_at, now()),
        ends_at = GREATEST(ends_at, now() + make_interval(days => v_config.duration_days)),
        email_normalized = COALESCE(v_email, email_normalized),
        grant_source = 'admin',
        granted_by = v_admin
    WHERE id = v_existing.id
    RETURNING * INTO v_existing;

    RETURN jsonb_build_object('granted', true, 'reason', 'updated', 'seat_number', v_existing.seat_number, 'ends_at', v_existing.ends_at);
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
    user_id, email_normalized, environment, status, starts_at, ends_at, seat_number, grant_source, granted_by
  ) VALUES (
    p_user_id,
    v_email,
    v_config.environment,
    'active',
    now(),
    now() + make_interval(days => v_config.duration_days),
    v_seat,
    'admin',
    v_admin
  )
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object('granted', true, 'reason', 'created', 'seat_number', v_existing.seat_number, 'ends_at', v_existing.ends_at, 'max_seats', v_config.max_seats);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_pilot_access(p_user_id uuid, p_environment text DEFAULT 'live')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_grant public.pilot_access_grants%ROWTYPE;
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pilot_access_grants
  SET status = 'revoked',
      ends_at = LEAST(ends_at, now()),
      granted_by = v_admin
  WHERE user_id = p_user_id
    AND environment = COALESCE(p_environment, 'live')
    AND status = 'active'
  RETURNING * INTO v_grant;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('revoked', false, 'reason', 'no_active_grant');
  END IF;

  RETURN jsonb_build_object('revoked', true, 'seat_number', v_grant.seat_number, 'ended_at', v_grant.ends_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pilot_access_summary(p_environment text DEFAULT 'live')
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
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_config
  FROM public.pilot_access_config
  WHERE environment = COALESCE(p_environment, 'live');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('configured', false, 'environment', COALESCE(p_environment, 'live'));
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
    'duration_days', v_config.duration_days,
    'used_seats', v_used,
    'remaining_seats', GREATEST(v_config.max_seats - v_used, 0),
    'active_grants', (
      SELECT count(*)::integer
      FROM public.pilot_access_grants
      WHERE environment = v_config.environment
        AND status = 'active'
        AND ends_at > now()
    ),
    'revoked_grants', (
      SELECT count(*)::integer
      FROM public.pilot_access_grants
      WHERE environment = v_config.environment
        AND status = 'revoked'
    ),
    'expired_grants', (
      SELECT count(*)::integer
      FROM public.pilot_access_grants
      WHERE environment = v_config.environment
        AND status = 'active'
        AND ends_at <= now()
    ),
    'expiring_soon', (
      SELECT count(*)::integer
      FROM public.pilot_access_grants
      WHERE environment = v_config.environment
        AND status = 'active'
        AND ends_at > now()
        AND ends_at <= now() + interval '7 days'
    )
  );
END;
$$;