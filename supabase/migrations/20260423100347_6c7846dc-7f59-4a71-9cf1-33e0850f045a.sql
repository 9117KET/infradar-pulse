-- Lifetime grants: a row here = permanent Pro-tier access for that user/env.
CREATE TABLE IF NOT EXISTS public.lifetime_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  paddle_transaction_id text,
  paddle_customer_id text,
  seat_number integer,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_lifetime_grants_user ON public.lifetime_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_lifetime_grants_env_seat ON public.lifetime_grants(environment, seat_number);

ALTER TABLE public.lifetime_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own lifetime grants"
  ON public.lifetime_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages lifetime grants"
  ON public.lifetime_grants FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins view all lifetime grants"
  ON public.lifetime_grants FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Public seat counter: lets the marketing page display "X of 100 remaining"
-- without exposing customer identities.
CREATE OR REPLACE FUNCTION public.lifetime_seats_taken(p_environment text DEFAULT 'live')
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.lifetime_grants
  WHERE environment = p_environment;
$$;

GRANT EXECUTE ON FUNCTION public.lifetime_seats_taken(text) TO anon, authenticated;

-- Atomically claim a founder seat (1..100). Returns NULL if sold out or
-- if the user already has a grant. Called from the webhook only.
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
  -- Idempotent: if user already has a grant, return their existing seat.
  SELECT seat_number INTO v_existing
  FROM public.lifetime_grants
  WHERE user_id = p_user_id AND environment = p_environment;
  IF FOUND THEN RETURN v_existing; END IF;

  -- Lock the env partition to serialize seat allocation.
  SELECT COUNT(*) INTO v_taken FROM public.lifetime_grants
  WHERE environment = p_environment FOR UPDATE;

  IF v_taken >= p_max_seats THEN
    -- Sold out: still record the grant (paying customers always get access),
    -- but with no seat number so the public counter caps at 100.
    INSERT INTO public.lifetime_grants
      (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number)
    VALUES (p_user_id, p_environment, p_paddle_transaction_id, p_paddle_customer_id, NULL);
    RETURN NULL;
  END IF;

  v_seat := v_taken + 1;
  INSERT INTO public.lifetime_grants
    (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number)
  VALUES (p_user_id, p_environment, p_paddle_transaction_id, p_paddle_customer_id, v_seat);
  RETURN v_seat;
END;
$$;

-- Update has_active_subscription to also recognize lifetime grants.
CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'live')
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.lifetime_grants
      WHERE user_id = user_uuid AND environment = check_env
    )
    OR EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = user_uuid
        AND environment = check_env
        AND status IN ('active', 'trialing')
        AND (current_period_end IS NULL OR current_period_end > now())
    );
$$;

-- Track that the trial-ending email has been sent (avoid duplicates).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS notified_trial_ending_at timestamptz;
