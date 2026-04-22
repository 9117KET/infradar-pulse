-- Records every trial that has ever been started across the platform so we
-- can deny a second free trial to the same person (same email or same Paddle
-- customer). Independent of subscriptions so deleting/updating a sub never
-- forgets that the trial was used.
CREATE TABLE IF NOT EXISTS public.trial_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  -- Normalized email = lowercased, trimmed, stripped of "+tag" suffix on the
  -- local part. Catches user+a@gmail.com / user+b@gmail.com as the same person.
  email_normalized text NOT NULL,
  paddle_customer_id text,
  environment text NOT NULL DEFAULT 'sandbox',
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_history_user ON public.trial_history(user_id);
CREATE INDEX IF NOT EXISTS idx_trial_history_email ON public.trial_history(email_normalized, environment);
CREATE INDEX IF NOT EXISTS idx_trial_history_customer ON public.trial_history(paddle_customer_id, environment);

ALTER TABLE public.trial_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages trial history"
  ON public.trial_history FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users view own trial history"
  ON public.trial_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins view all trial history"
  ON public.trial_history FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Normalize an email so user+a@gmail.com and user+b@gmail.com match.
-- Lowercases, trims, drops everything between the first "+" and the "@".
CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_email IS NULL THEN NULL
    ELSE lower(trim(regexp_replace(p_email, '\+[^@]*(@)', '\1')))
  END;
$$;

-- Record a started trial. Idempotent: re-calling for the same user/env is a no-op.
CREATE OR REPLACE FUNCTION public.record_trial_started(
  p_user_id uuid,
  p_email text,
  p_paddle_customer_id text,
  p_environment text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- One trial record per user per environment. If the user already has one,
  -- do nothing.
  IF EXISTS (
    SELECT 1 FROM public.trial_history
    WHERE user_id = p_user_id AND environment = p_environment
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.trial_history (
    user_id, email_normalized, paddle_customer_id, environment
  ) VALUES (
    p_user_id,
    public.normalize_email(p_email),
    p_paddle_customer_id,
    p_environment
  );
END;
$$;

-- Returns true if the user is eligible for a free trial in the given env.
-- Eligible = no prior trial by this user_id, normalized email, or paddle customer.
CREATE OR REPLACE FUNCTION public.check_trial_eligible(
  p_user_id uuid,
  p_email text,
  p_paddle_customer_id text,
  p_environment text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.trial_history
    WHERE environment = p_environment
      AND (
        user_id = p_user_id
        OR (p_email IS NOT NULL AND email_normalized = public.normalize_email(p_email))
        OR (p_paddle_customer_id IS NOT NULL AND paddle_customer_id = p_paddle_customer_id)
      )
  );
$$;