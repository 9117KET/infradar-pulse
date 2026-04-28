CREATE TABLE IF NOT EXISTS public.pilot_access_config (
  environment text PRIMARY KEY DEFAULT 'live',
  enabled boolean NOT NULL DEFAULT true,
  max_seats integer NOT NULL DEFAULT 100,
  duration_days integer NOT NULL DEFAULT 30,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pilot_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_normalized text,
  environment text NOT NULL DEFAULT 'live',
  status text NOT NULL DEFAULT 'active',
  starts_at timestamp with time zone NOT NULL DEFAULT now(),
  ends_at timestamp with time zone NOT NULL,
  seat_number integer,
  grant_source text NOT NULL DEFAULT 'automatic',
  granted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pilot_access_grants_user_environment_key
  ON public.pilot_access_grants (user_id, environment);

CREATE UNIQUE INDEX IF NOT EXISTS pilot_access_grants_environment_seat_key
  ON public.pilot_access_grants (environment, seat_number)
  WHERE seat_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pilot_access_grants_user_id
  ON public.pilot_access_grants (user_id);

CREATE INDEX IF NOT EXISTS idx_pilot_access_grants_active
  ON public.pilot_access_grants (environment, status, ends_at);

ALTER TABLE public.pilot_access_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read pilot config" ON public.pilot_access_config;
CREATE POLICY "Admins can read pilot config"
ON public.pilot_access_config
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update pilot config" ON public.pilot_access_config;
CREATE POLICY "Admins can update pilot config"
ON public.pilot_access_config
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can insert pilot config" ON public.pilot_access_config;
CREATE POLICY "Admins can insert pilot config"
ON public.pilot_access_config
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can read all pilot grants" ON public.pilot_access_grants;
CREATE POLICY "Admins can read all pilot grants"
ON public.pilot_access_grants
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users can read own pilot grant" ON public.pilot_access_grants;
CREATE POLICY "Users can read own pilot grant"
ON public.pilot_access_grants
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages pilot grants" ON public.pilot_access_grants;
CREATE POLICY "Service role manages pilot grants"
ON public.pilot_access_grants
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.set_pilot_access_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_pilot_access_config_updated_at ON public.pilot_access_config;
CREATE TRIGGER update_pilot_access_config_updated_at
BEFORE UPDATE ON public.pilot_access_config
FOR EACH ROW
EXECUTE FUNCTION public.set_pilot_access_updated_at();

DROP TRIGGER IF EXISTS update_pilot_access_grants_updated_at ON public.pilot_access_grants;
CREATE TRIGGER update_pilot_access_grants_updated_at
BEFORE UPDATE ON public.pilot_access_grants
FOR EACH ROW
EXECUTE FUNCTION public.set_pilot_access_updated_at();

INSERT INTO public.pilot_access_config (environment, enabled, max_seats, duration_days)
VALUES ('live', true, 100, 30)
ON CONFLICT (environment) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_active_pilot_access(_user_id uuid, check_env text DEFAULT 'live')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pilot_access_grants pag
    WHERE pag.user_id = _user_id
      AND pag.environment = check_env
      AND pag.status = 'active'
      AND pag.starts_at <= now()
      AND pag.ends_at > now()
  );
$$;

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
      'ends_at', v_existing.ends_at
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

CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'live')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_active_pilot_access(user_uuid, check_env)
    OR EXISTS (
      SELECT 1 FROM public.no_card_trial_grants nct
      WHERE nct.user_id = user_uuid
        AND nct.environment = check_env
        AND nct.status = 'active'
        AND nct.ends_at > now()
    )
    OR EXISTS (
      SELECT 1 FROM public.lifetime_grants
      WHERE user_id = user_uuid AND environment = check_env
    )
    OR EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = user_uuid
        AND environment = check_env
        AND status IN ('active', 'trialing', 'past_due')
        AND (current_period_end IS NULL OR current_period_end > now())
    )
    OR EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = user_uuid
        AND environment = check_env
        AND status IN ('canceled', 'unpaid')
        AND current_period_end > now()
    );
$$;

CREATE OR REPLACE FUNCTION public.has_paid_or_staff_access(_user_id uuid, check_env text DEFAULT 'live')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'researcher'::public.app_role)
    OR public.has_active_pilot_access(_user_id, check_env)
    OR EXISTS (
      SELECT 1
      FROM public.no_card_trial_grants nct
      WHERE nct.user_id = _user_id
        AND nct.environment = check_env
        AND nct.status = 'active'
        AND nct.ends_at > now()
    )
    OR EXISTS (
      SELECT 1
      FROM public.lifetime_grants lg
      WHERE lg.user_id = _user_id
        AND lg.environment = check_env
    )
    OR EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.environment = check_env
        AND s.status IN ('active', 'trialing', 'past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    )
    OR EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.environment = check_env
        AND s.status IN ('canceled', 'unpaid')
        AND s.current_period_end > now()
    );
$$;

CREATE OR REPLACE FUNCTION public.has_paid_or_staff_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_paid_or_staff_access(_user_id, 'live');
$$;

REVOKE ALL ON FUNCTION public.has_active_pilot_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_own_pilot_access(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_pilot_access(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pilot_access_summary(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_active_pilot_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_own_pilot_access(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_pilot_access(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pilot_access_summary(text) TO authenticated;

NOTIFY pgrst, 'reload schema';