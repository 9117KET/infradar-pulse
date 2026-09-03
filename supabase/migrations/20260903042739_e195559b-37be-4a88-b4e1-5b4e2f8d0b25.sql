-- 1) Revoke anonymous execution on sensitive SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.admin_grant_lifetime_access(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_lifetime_access(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_report_share(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_referral_summary() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_paid_contact_access(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_broken_sources(boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cron_auth_preflight() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cron_jobs_with_baked_credentials() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, PUBLIC;

-- Keep genuinely public entry points reachable by visitors.
GRANT EXECUTE ON FUNCTION public.get_public_pilot_access_counter(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lifetime_seats_taken(text) TO anon, authenticated;

-- 2) Revoke signed-in execution on server-only maintenance routines.
REVOKE EXECUTE ON FUNCTION public.cleanup_broken_sources(boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.list_admin_emails() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_auth_preflight() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_jobs_with_baked_credentials() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_agent_auth_alerts(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_pilot_access(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_agent_auth_failures(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_silent_agent_stoppage(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_agent_cron_health(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_agent_http_health(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_existing_project_recheck_summary() FROM authenticated;

-- Backend always retains access.
GRANT EXECUTE ON FUNCTION public.cleanup_broken_sources(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;
GRANT EXECUTE ON FUNCTION public.list_admin_emails() TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_auth_preflight() TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_jobs_with_baked_credentials() TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_agent_auth_alerts(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_pilot_access(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_paid_contact_access(uuid, text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_agent_auth_failures(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_silent_agent_stoppage(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_agent_cron_health(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_agent_http_health(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_existing_project_recheck_summary() TO service_role;

-- 3) Move the networking extension out of the public schema when relocatable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_net' AND n.nspname = 'public'
  ) THEN
    BEGIN
      EXECUTE 'ALTER EXTENSION pg_net SET SCHEMA extensions';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_net could not be relocated: %', SQLERRM;
    END;
  END IF;
END $$;