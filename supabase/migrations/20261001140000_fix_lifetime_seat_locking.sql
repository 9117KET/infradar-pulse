-- Fix: every lifetime-seat function took its lock with
--   SELECT COUNT(*) ... FROM lifetime_grants ... FOR UPDATE
-- which PostgreSQL rejects outright ("FOR UPDATE is not allowed with aggregate
-- functions"). So claim_lifetime_seat (Paddle), claim_lifetime_seat_ls (Lemon
-- Squeezy) and admin_grant_lifetime_access all raised on every call: a paid
-- Lifetime purchase would charge the customer and never provision the seat.
--
-- All three now serialise on the SAME transaction-scoped advisory lock per
-- environment, taken before any read. That keeps the guarantees the row lock
-- was meant to give: seat numbers are unique and never exceed p_max_seats,
-- the paths block each other (20260609000005's concern), and a duplicate
-- webhook for the same user returns the existing seat. Behaviour is otherwise
-- unchanged. Requires 20260724120000_lemonsqueezy_provider.sql (ls_* columns).

CREATE OR REPLACE FUNCTION public._lifetime_seat_lock(p_environment text)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  SELECT pg_advisory_xact_lock(hashtext('lifetime_grants:' || COALESCE(p_environment, 'live')));
$$;
REVOKE ALL ON FUNCTION public._lifetime_seat_lock(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.claim_lifetime_seat(
  p_user_id uuid, p_environment text, p_paddle_transaction_id text, p_paddle_customer_id text, p_max_seats integer DEFAULT 100
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing integer; v_taken integer; v_seat integer;
BEGIN
  PERFORM public._lifetime_seat_lock(p_environment);
  SELECT seat_number INTO v_existing FROM public.lifetime_grants
  WHERE user_id = p_user_id AND environment = p_environment;
  IF FOUND THEN RETURN v_existing; END IF;
  SELECT COUNT(*) INTO v_taken FROM public.lifetime_grants WHERE environment = p_environment;
  IF v_taken >= p_max_seats THEN
    INSERT INTO public.lifetime_grants (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number)
    VALUES (p_user_id, p_environment, p_paddle_transaction_id, p_paddle_customer_id, NULL);
    RETURN NULL;
  END IF;
  SELECT COALESCE(MAX(seat_number), 0) + 1 INTO v_seat FROM public.lifetime_grants WHERE environment = p_environment;
  INSERT INTO public.lifetime_grants (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number)
  VALUES (p_user_id, p_environment, p_paddle_transaction_id, p_paddle_customer_id, v_seat);
  RETURN v_seat;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_lifetime_seat_ls(
  p_user_id uuid, p_environment text, p_ls_order_id text, p_ls_customer_id text, p_max_seats integer DEFAULT 100
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing integer; v_taken integer; v_seat integer;
BEGIN
  PERFORM public._lifetime_seat_lock(p_environment);
  SELECT seat_number INTO v_existing FROM public.lifetime_grants
  WHERE user_id = p_user_id AND environment = p_environment;
  IF FOUND THEN RETURN v_existing; END IF;
  SELECT COUNT(*) INTO v_taken FROM public.lifetime_grants WHERE environment = p_environment;
  IF v_taken >= p_max_seats THEN
    INSERT INTO public.lifetime_grants (user_id, environment, ls_order_id, ls_customer_id, seat_number, grant_source)
    VALUES (p_user_id, p_environment, p_ls_order_id, p_ls_customer_id, NULL, 'lemonsqueezy');
    RETURN NULL;
  END IF;
  SELECT COALESCE(MAX(seat_number), 0) + 1 INTO v_seat FROM public.lifetime_grants WHERE environment = p_environment;
  INSERT INTO public.lifetime_grants (user_id, environment, ls_order_id, ls_customer_id, seat_number, grant_source)
  VALUES (p_user_id, p_environment, p_ls_order_id, p_ls_customer_id, v_seat, 'lemonsqueezy');
  RETURN v_seat;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_grant_lifetime_access(p_user_id uuid, p_environment text DEFAULT 'live')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid(); v_taken integer; v_seat integer; v_existing public.lifetime_grants%ROWTYPE; v_max_seats integer := 100;
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023'; END IF;
  PERFORM public._lifetime_seat_lock(p_environment);
  SELECT COUNT(*) INTO v_taken FROM public.lifetime_grants WHERE environment = COALESCE(p_environment,'live');
  SELECT * INTO v_existing FROM public.lifetime_grants WHERE user_id = p_user_id AND environment = COALESCE(p_environment,'live');
  IF FOUND THEN
    RETURN jsonb_build_object('granted',true,'reason','existing','seat_number',v_existing.seat_number,'grant_source',v_existing.grant_source);
  END IF;
  IF v_taken < v_max_seats THEN
    SELECT COALESCE(MAX(seat_number),0)+1 INTO v_seat FROM public.lifetime_grants WHERE environment = COALESCE(p_environment,'live');
  ELSE v_seat := NULL; END IF;
  INSERT INTO public.lifetime_grants (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number, grant_source, granted_by)
  VALUES (p_user_id, COALESCE(p_environment,'live'), NULL, NULL, v_seat, 'admin', v_admin)
  RETURNING * INTO v_existing;
  RETURN jsonb_build_object('granted',true,'reason','created','seat_number',v_existing.seat_number);
END; $$;

-- Re-assert grants (CREATE OR REPLACE keeps them, but be explicit).
REVOKE ALL ON FUNCTION public.claim_lifetime_seat(uuid, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_lifetime_seat_ls(uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_lifetime_seat(uuid, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_lifetime_seat_ls(uuid, text, text, text, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_grant_lifetime_access(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_lifetime_access(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
