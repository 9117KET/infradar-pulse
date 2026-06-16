-- Pre-payment demand validation ("painted door").
--
-- While billing is not live, every Upgrade/Choose-plan CTA opens an honest
-- founding-access modal instead of a checkout. This table records the resulting
-- intent so we can decide whether to build payments at all, and at what price.
--
-- Privacy: this is first-party, user-initiated data (they fill the form). It is
-- covered by the existing Privacy Notice (account data + product analytics).

CREATE TABLE IF NOT EXISTS public.plan_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  plan_key text NOT NULL,
  billing_cycle text,                          -- 'monthly' | 'yearly' | 'lifetime'
  sentiment text NOT NULL,                     -- 'ready' | 'maybe' | 'curious'
  expected_price integer,                      -- willingness-to-pay (price discovery)
  expected_currency text DEFAULT 'USD',
  note text,
  source text,                                 -- 'pricing' | 'upgrade_dialog' | 'settings'
  current_plan text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,  -- usage snapshot, cycle, etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_interest_sentiment_chk CHECK (sentiment IN ('ready', 'maybe', 'curious'))
);

CREATE INDEX IF NOT EXISTS idx_plan_interest_created_at ON public.plan_interest(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_interest_user_id ON public.plan_interest(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_interest_plan_sentiment ON public.plan_interest(plan_key, sentiment);

ALTER TABLE public.plan_interest ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous pricing-page visitors) may register interest. If they
-- are signed in, the row must be tagged with their own id (no spoofing others).
DROP POLICY IF EXISTS "Anyone can register plan interest" ON public.plan_interest;
CREATE POLICY "Anyone can register plan interest"
ON public.plan_interest
FOR INSERT
TO anon, authenticated
WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- Users can see their own submissions.
DROP POLICY IF EXISTS "Users read own plan interest" ON public.plan_interest;
CREATE POLICY "Users read own plan interest"
ON public.plan_interest
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins read everything (founder dashboard / Traction page).
DROP POLICY IF EXISTS "Admins read all plan interest" ON public.plan_interest;
CREATE POLICY "Admins read all plan interest"
ON public.plan_interest
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Service role manages plan interest" ON public.plan_interest;
CREATE POLICY "Service role manages plan interest"
ON public.plan_interest
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Coarse, transparent location for the analytics stream (already disclosed in
-- the Privacy Notice as "device and connection data"). Country only — set
-- server-side from the CDN edge header, never precise GPS.
ALTER TABLE public.user_events
  ADD COLUMN IF NOT EXISTS country text;

NOTIFY pgrst, 'reload schema';
