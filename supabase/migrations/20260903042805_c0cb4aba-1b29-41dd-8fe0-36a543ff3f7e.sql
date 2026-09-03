REVOKE EXECUTE ON FUNCTION public.revoke_report_share(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_report_share(uuid) TO authenticated, service_role;