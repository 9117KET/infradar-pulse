-- Close the default PUBLIC execute grant so anonymous callers cannot reach the
-- new SECURITY DEFINER routines. Staff-facing routines keep an explicit
-- `authenticated` grant and still verify the caller's role internally.
REVOKE ALL ON FUNCTION public.update_proposal_auto_decision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_apply_update_proposal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_apply_pending_update_proposals(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_project_pair(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_duplicate_projects(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.escalate_to_human(text, text, text, text, text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_escalation(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_proposal_auto_decision(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_apply_update_proposal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_apply_pending_update_proposals(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_project_pair(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_projects(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escalate_to_human(text, text, text, text, text, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_escalation(uuid, text, text) TO authenticated, service_role;