REVOKE EXECUTE ON FUNCTION public.apply_update_proposal(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.promote_project_candidate(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.detect_agent_auth_failures(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.detect_silent_agent_stoppage(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_agent_cron_health(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_agent_http_health(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_existing_project_recheck_summary() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_admin_emails() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reset_stuck_agent_task(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.resolve_agent_auth_alerts(text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.apply_update_proposal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_project_candidate(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_agent_auth_failures(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_silent_agent_stoppage(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_cron_health(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_http_health(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_existing_project_recheck_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_emails() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_stuck_agent_task(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_agent_auth_alerts(text) TO authenticated;

ALTER FUNCTION public._coerce_region(text) SET search_path = public;
ALTER FUNCTION public._coerce_sector(text) SET search_path = public;
ALTER FUNCTION public._coerce_stage(text) SET search_path = public;
ALTER FUNCTION public._coerce_status(text) SET search_path = public;