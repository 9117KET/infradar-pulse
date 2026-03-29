-- Manual RLS spot-check (run in SQL Editor or psql as authenticated role via Studio).
-- Replace :user_a and :user_b with real auth.users ids from your test accounts.
-- Staff user: must have user_roles.role IN ('admin','researcher').

-- 1) Confirm is_staff() matches dashboard expectations
-- SELECT public.is_staff('00000000-0000-0000-0000-000000000001'::uuid);

-- 2) projects: user A should not see user B's private rows (adjust column names to match your schema)
-- SET request.jwt.claim.sub = '<user_a_uuid>';  -- not available in all SQL editors; prefer Studio “Run as user” or REST with JWT
-- SELECT id, created_by FROM public.projects LIMIT 20;

-- 3) research_tasks: non-staff should only see rows where requested_by = self
-- SELECT id, requested_by, task_type FROM public.research_tasks ORDER BY created_at DESC LIMIT 20;

-- 4) insights / subscribers: verify SELECT policies match product rules (see migration 20260330120000_security_rls_hardening.sql)
