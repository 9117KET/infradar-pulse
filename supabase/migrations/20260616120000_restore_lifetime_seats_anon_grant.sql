-- Restore anon EXECUTE on the public lifetime-seat counter.
--
-- 20260423100347 intentionally granted EXECUTE to anon on lifetime_seats_taken
-- (the marketing "X of 100 seats remaining" counter — returns only an aggregate
-- count, never customer identities). The security-hardening migration
-- 20260428214909 then looped over every SECURITY DEFINER function and ran
-- `REVOKE EXECUTE ... FROM PUBLIC, anon`, which swept up this function too.
--
-- Result: the logged-out Pricing page (src/pages/Pricing.tsx) calls
-- supabase.rpc('lifetime_seats_taken') and gets 401, so the urgency badge never
-- renders for anonymous visitors. Re-grant anon explicitly; this is the only
-- SECURITY DEFINER function that is meant to be public.
GRANT EXECUTE ON FUNCTION public.lifetime_seats_taken(text) TO anon;

NOTIFY pgrst, 'reload schema';
