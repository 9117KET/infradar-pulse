-- Pre-launch security hardening: revoke two SECURITY DEFINER RPCs from
-- `authenticated`. Both were granted to authenticated in
-- 20260518205950_913f6e9b-2cb1-4fef-a65b-06b318f0f05c.sql but have NO internal
-- authorization check, and no browser client ever calls them — their only real
-- callers are service-role Edge Functions (agent-health-monitor,
-- cron-heartbeat-check, link-validator).
--
--   * list_admin_emails()            — any signed-in user could harvest every
--                                      admin's auth.users email (phishing target).
--   * resolve_agent_auth_alerts(text)— any signed-in user could clear staff-only
--                                      agent health alerts, blanking the outage signal.
--
-- We do NOT add an internal has_role(auth.uid(),...) guard: the legitimate
-- callers run as the service role, where auth.uid() is NULL, so such a guard
-- would block them. Revoking the stray grant is the correct, sufficient fix —
-- service_role retains EXECUTE.
--
-- NOTE: migrations do not auto-apply to the hosted project. Apply this in the
-- Supabase SQL editor (or via `supabase db push`) against yofglpxqpouqqhkidlkx.

REVOKE EXECUTE ON FUNCTION public.list_admin_emails() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.list_admin_emails() TO service_role;

REVOKE EXECUTE ON FUNCTION public.resolve_agent_auth_alerts(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.resolve_agent_auth_alerts(text) TO service_role;
