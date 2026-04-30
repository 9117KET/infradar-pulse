REVOKE EXECUTE ON FUNCTION public.reap_stuck_research_tasks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stuck_research_tasks() TO postgres, service_role;