-- Add acquisition attribution columns to profiles.
-- These are written once on first login after signup, capturing UTM params
-- stored in sessionStorage during the signup flow.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acq_source    text,
  ADD COLUMN IF NOT EXISTS acq_medium    text,
  ADD COLUMN IF NOT EXISTS acq_campaign  text,
  ADD COLUMN IF NOT EXISTS acq_term      text,
  ADD COLUMN IF NOT EXISTS acq_content   text;

-- Add referral tracking columns for the referral program
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by_code text;

-- Referral codes table: one code per user
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code        text UNIQUE NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own referral code" ON public.referral_codes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own referral code" ON public.referral_codes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Referral events: tracks sign-ups via referral codes
CREATE TABLE IF NOT EXISTS public.referral_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code              text NOT NULL,
  converted_to_paid boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referrer reads own events" ON public.referral_events
  FOR SELECT USING (auth.uid() = referrer_id);
-- Admins can read all (for the traction dashboard)
CREATE POLICY "Admin reads all referral events" ON public.referral_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
