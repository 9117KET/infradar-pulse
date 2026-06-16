-- Referral-driven usage-credit reward engine.
--
-- The bonus is DERIVED LIVE from referral_events + auth.users on every call.
-- It is never stored as a spendable balance, which removes drift, double-award
-- and replay-fraud risk (revoking a referral instantly lowers the bonus).
--
-- Economics (confirmed with product):
--   * Referrer earns +3 AI/day per qualified referral, capped at +30/day.
--   * A "qualified" referral = a non-revoked referral_events row whose referred
--     user has a confirmed email. claim_referral_signup() only runs on first
--     login (which already requires email verification), so in practice a row
--     implies a verified user; the email_confirmed_at check is belt-and-braces.
--   * The newly referred user gets a two-sided welcome bonus of +3 AI/day for
--     their first 14 days.
--
-- These functions are consumed by supabase/functions/_shared/entitlementCheck.ts
-- (service-role) which adds the result to the free-tier daily AI cap.

-- Count of qualified referrals made by a user.
CREATE OR REPLACE FUNCTION public.qualified_referral_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.referral_events re
  WHERE re.referrer_id = p_user_id
    AND re.reward_status <> 'revoked'
    AND EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = re.referred_id
        AND u.email_confirmed_at IS NOT NULL
    );
$$;

-- Bonus daily AI quota earned from referring others: +3 each, capped at +30.
CREATE OR REPLACE FUNCTION public.referral_ai_bonus(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT LEAST(public.qualified_referral_count(p_user_id) * 3, 30);
$$;

-- Two-sided welcome bonus for a newly referred user: +3 AI/day for 14 days.
CREATE OR REPLACE FUNCTION public.referred_welcome_bonus(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.referral_events re
    WHERE re.referred_id = p_user_id
      AND re.reward_status <> 'revoked'
      AND re.created_at > now() - interval '14 days'
  ) THEN 3 ELSE 0 END;
$$;

-- Self-service summary for the referral dashboard. Reads auth.uid() so it is
-- safe to expose to authenticated users (each sees only their own numbers).
CREATE OR REPLACE FUNCTION public.my_referral_summary()
RETURNS TABLE(qualified_count int, pending_count int, ai_bonus int, welcome_bonus int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.qualified_referral_count(auth.uid()),
    GREATEST(
      (SELECT count(*)::int FROM public.referral_events
         WHERE referrer_id = auth.uid() AND reward_status <> 'revoked')
        - public.qualified_referral_count(auth.uid()),
      0
    ),
    public.referral_ai_bonus(auth.uid()),
    public.referred_welcome_bonus(auth.uid());
$$;

-- Cosmetic label flip used for analytics (pending -> awarded). The bonus itself
-- is computed live, so this is best-effort and not the source of truth.
CREATE OR REPLACE FUNCTION public.mark_referral_qualified(p_referred_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.referral_events
  SET reward_status = 'awarded'
  WHERE referred_id = p_referred_user_id
    AND reward_status = 'pending';
END;
$$;

-- Speeds up the EXISTS check that joins referrals to AI usage / lookups.
CREATE INDEX IF NOT EXISTS idx_referral_events_referrer_status
  ON public.referral_events(referrer_id, reward_status);

-- Grants: only the self-scoped summary is callable by end users. The raw
-- count/bonus/mark functions are invoked with the service-role client only.
REVOKE ALL ON FUNCTION public.qualified_referral_count(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.referral_ai_bonus(uuid)        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.referred_welcome_bonus(uuid)   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_referral_qualified(uuid)  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_referral_summary() TO authenticated;

NOTIFY pgrst, 'reload schema';
