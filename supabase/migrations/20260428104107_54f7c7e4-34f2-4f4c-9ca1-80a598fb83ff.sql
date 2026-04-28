REVOKE ALL ON FUNCTION public.claim_referral_signup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_referral_signup(text) TO authenticated;