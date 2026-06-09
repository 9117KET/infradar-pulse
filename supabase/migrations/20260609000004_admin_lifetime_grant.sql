-- Add audit columns to lifetime_grants so admin-created grants are distinguishable
-- from Paddle-triggered ones.
ALTER TABLE public.lifetime_grants
  ADD COLUMN IF NOT EXISTS grant_source text NOT NULL DEFAULT 'paddle',
  ADD COLUMN IF NOT EXISTS granted_by uuid;

-- admin_grant_lifetime_access
-- Idempotent: re-calling for a user who already has a grant is a no-op (returns
-- existing row). Seat allocation mirrors claim_lifetime_seat: assigns the next
-- seat number if under max_seats, inserts with NULL seat_number if sold out
-- (access is granted regardless).
CREATE OR REPLACE FUNCTION public.admin_grant_lifetime_access(
  p_user_id uuid,
  p_environment text DEFAULT 'live'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_taken integer;
  v_seat integer;
  v_existing public.lifetime_grants%ROWTYPE;
  v_max_seats integer := 100;
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;

  -- Serialize seat allocation for this environment.
  PERFORM pg_advisory_xact_lock(hashtext('lifetime_grants:' || COALESCE(p_environment, 'live')));

  -- Idempotent: user already has a lifetime grant.
  SELECT * INTO v_existing
  FROM public.lifetime_grants
  WHERE user_id = p_user_id AND environment = COALESCE(p_environment, 'live');

  IF FOUND THEN
    RETURN jsonb_build_object(
      'granted', true,
      'reason', 'existing',
      'seat_number', v_existing.seat_number,
      'grant_source', v_existing.grant_source
    );
  END IF;

  SELECT COUNT(*)::integer INTO v_taken
  FROM public.lifetime_grants
  WHERE environment = COALESCE(p_environment, 'live')
    AND seat_number IS NOT NULL;

  IF v_taken < v_max_seats THEN
    v_seat := v_taken + 1;
  ELSE
    v_seat := NULL; -- sold out of named seats; access still granted
  END IF;

  INSERT INTO public.lifetime_grants
    (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number, grant_source, granted_by)
  VALUES
    (p_user_id, COALESCE(p_environment, 'live'), NULL, NULL, v_seat, 'admin', v_admin)
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'granted', true,
    'reason', 'created',
    'seat_number', v_existing.seat_number
  );
END;
$$;

-- admin_revoke_lifetime_access
-- Deletes the grant row entirely. The lifetime_grants table has no status column
-- so there is no "soft revoke" — removing the row is the correct operation.
CREATE OR REPLACE FUNCTION public.admin_revoke_lifetime_access(
  p_user_id uuid,
  p_environment text DEFAULT 'live'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_seat integer;
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.lifetime_grants
  WHERE user_id = p_user_id AND environment = COALESCE(p_environment, 'live')
  RETURNING seat_number INTO v_seat;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('revoked', false, 'reason', 'no_grant');
  END IF;

  RETURN jsonb_build_object('revoked', true, 'seat_number', v_seat);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_lifetime_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_lifetime_access(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_grant_lifetime_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_lifetime_access(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
