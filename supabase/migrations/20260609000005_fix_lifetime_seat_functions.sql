-- Fix 1: lifetime_seats_taken() was counting ALL rows including NULL-seat post-sellout
-- rows. The marketing page "X of 100 remaining" counter should only count named seats.
CREATE OR REPLACE FUNCTION public.lifetime_seats_taken(p_environment text DEFAULT 'live')
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.lifetime_grants
  WHERE environment = p_environment
    AND seat_number IS NOT NULL;
$$;

-- Fix 2: claim_lifetime_seat was using v_taken + 1 (total row count) as the next seat
-- number. After a grant is revoked (row deleted), v_taken decrements and the recycled
-- index collides with an existing seat holder.
-- Fix: use COALESCE(MAX(seat_number), 0) + 1 to always assign above the current maximum.
CREATE OR REPLACE FUNCTION public.claim_lifetime_seat(
  p_user_id uuid,
  p_environment text,
  p_paddle_transaction_id text,
  p_paddle_customer_id text,
  p_max_seats integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing integer;
  v_taken integer;
  v_seat integer;
BEGIN
  SELECT seat_number INTO v_existing
  FROM public.lifetime_grants
  WHERE user_id = p_user_id AND environment = p_environment;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT COUNT(*) INTO v_taken FROM public.lifetime_grants
  WHERE environment = p_environment FOR UPDATE;

  IF v_taken >= p_max_seats THEN
    INSERT INTO public.lifetime_grants
      (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number)
    VALUES (p_user_id, p_environment, p_paddle_transaction_id, p_paddle_customer_id, NULL);
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(seat_number), 0) + 1 INTO v_seat
  FROM public.lifetime_grants
  WHERE environment = p_environment;

  INSERT INTO public.lifetime_grants
    (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number)
  VALUES (p_user_id, p_environment, p_paddle_transaction_id, p_paddle_customer_id, v_seat);
  RETURN v_seat;
END;
$$;

-- Fix 3: admin_grant_lifetime_access was using pg_advisory_xact_lock, which does not
-- block claim_lifetime_seat's SELECT ... FOR UPDATE row-level lock. The two functions
-- could run concurrently and both compute the same next seat number.
-- Fix: switch to the same SELECT ... FOR UPDATE pattern as claim_lifetime_seat so the
-- two functions mutually exclude. Also adopt MAX+1 for seat assignment.
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

  -- Same FOR UPDATE lock as claim_lifetime_seat — the two functions now block each other.
  SELECT COUNT(*) INTO v_taken FROM public.lifetime_grants
  WHERE environment = COALESCE(p_environment, 'live') FOR UPDATE;

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

  IF v_taken < v_max_seats THEN
    SELECT COALESCE(MAX(seat_number), 0) + 1 INTO v_seat
    FROM public.lifetime_grants
    WHERE environment = COALESCE(p_environment, 'live');
  ELSE
    v_seat := NULL;
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

NOTIFY pgrst, 'reload schema';
