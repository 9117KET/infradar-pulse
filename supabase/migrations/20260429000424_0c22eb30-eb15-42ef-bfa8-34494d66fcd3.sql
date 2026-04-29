REVOKE EXECUTE ON FUNCTION public.claim_own_pilot_access(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_grant_pilot_access(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_pilot_access(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pilot_access_summary(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_own_pilot_access(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_pilot_access(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_pilot_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pilot_access_summary(text) TO authenticated;