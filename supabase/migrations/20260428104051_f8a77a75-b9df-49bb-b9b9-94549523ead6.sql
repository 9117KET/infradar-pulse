ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acq_source text,
  ADD COLUMN IF NOT EXISTS acq_medium text,
  ADD COLUMN IF NOT EXISTS acq_campaign text,
  ADD COLUMN IF NOT EXISTS acq_term text,
  ADD COLUMN IF NOT EXISTS acq_content text,
  ADD COLUMN IF NOT EXISTS referred_by_code text;

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_code_format CHECK (code ~ '^[A-Z0-9]{4,32}$'),
  CONSTRAINT referral_codes_one_per_user UNIQUE (user_id)
);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own referral code" ON public.referral_codes;
CREATE POLICY "Users read own referral code"
ON public.referral_codes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own referral code" ON public.referral_codes;
CREATE POLICY "Users insert own referral code"
ON public.referral_codes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all referral codes" ON public.referral_codes;
CREATE POLICY "Admins read all referral codes"
ON public.referral_codes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Service role manages referral codes" ON public.referral_codes;
CREATE POLICY "Service role manages referral codes"
ON public.referral_codes
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL,
  converted_to_paid boolean NOT NULL DEFAULT false,
  conversion_environment text,
  conversion_plan_key text,
  conversion_price_id text,
  conversion_subscription_id text,
  converted_at timestamptz,
  reward_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_events_one_per_referred UNIQUE (referred_id),
  CONSTRAINT referral_events_no_self_referral CHECK (referrer_id <> referred_id)
);

ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read related referral events" ON public.referral_events;
CREATE POLICY "Users read related referral events"
ON public.referral_events
FOR SELECT
TO authenticated
USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

DROP POLICY IF EXISTS "Admins read all referral events" ON public.referral_events;
CREATE POLICY "Admins read all referral events"
ON public.referral_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Service role manages referral events" ON public.referral_events;
CREATE POLICY "Service role manages referral events"
ON public.referral_events
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.claim_referral_signup(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(trim(coalesce(p_code, '')));
  v_referrer uuid;
  v_referred uuid := auth.uid();
BEGIN
  IF v_referred IS NULL OR v_code = '' THEN
    RETURN false;
  END IF;

  SELECT user_id INTO v_referrer
  FROM public.referral_codes
  WHERE code = v_code;

  IF v_referrer IS NULL OR v_referrer = v_referred THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
  SET referred_by_code = COALESCE(referred_by_code, v_code),
      acq_source = COALESCE(acq_source, 'referral'),
      acq_medium = COALESCE(acq_medium, 'referral')
  WHERE id = v_referred;

  INSERT INTO public.referral_events (referrer_id, referred_id, code)
  VALUES (v_referrer, v_referred, v_code)
  ON CONFLICT (referred_id) DO NOTHING;

  RETURN true;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON public.referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_referrer_id ON public.referral_events(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_referred_id ON public.referral_events(referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_converted ON public.referral_events(converted_to_paid, converted_at);