GRANT EXECUTE ON FUNCTION public.auto_approve_candidate_backlog(integer) TO postgres;
GRANT EXECUTE ON FUNCTION public.candidate_is_auto_approvable(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.auto_promote_official_candidate(uuid, text, text) TO postgres;