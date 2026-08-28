-- Cron auth via vault: stop baking service-role keys into cron.job.command.
--
-- ROOT CAUSE THIS FIXES
-- ---------------------
-- Seven earlier migrations (20260421000001, 20260427210000, 20260619000000,
-- 20260619120100, 20260706121000, 20260706122000, 20260706200656) built the
-- Authorization header at SCHEDULE time:
--
--   auth_hdr := jsonb_build_object('Authorization', 'Bearer ' || svc_key);
--   PERFORM cron.schedule(..., format('... headers:=''%s''::jsonb ...', auth_hdr));
--
-- That freezes a JWT into cron.job.command. Rotate project keys and every one
-- of those jobs keeps firing on schedule while every HTTP call 401s. Agents go
-- silent; nothing in Postgres says so. This is what produced the 2026-07-22
-- outage that the external heartbeat has been reporting ever since.
--
-- Two things made it invisible for 34 days:
--   1. Baked credentials - no single place to rotate.
--   2. net.http_post() is ASYNC. It queues the request and returns an id, so
--      pg_cron marks the run 'succeeded' no matter what the endpoint answers.
--      job_run_details stayed green through a month of 401s.
--
-- WHAT THIS MIGRATION DOES
--   1. Hardens public._agent_cron_auth_header() so a missing/blank vault
--      secret RAISES instead of silently emitting a null Authorization value.
--   2. Adds public.cron_auth_preflight() - structurally validates the stored
--      key (JWT shape, role claim, expiry) without any network call.
--   3. Adds public.cron_jobs_with_baked_credentials() - the regression gate.
--   4. Rewrites every live cron.job command that carries a literal bearer
--      token so it calls the helper at RUN time instead.
--   5. Adds public.cron_http_failures - surfaces the async HTTP results that
--      job_run_details hides, so the next 401 storm is visible in one query.
--   6. Best-effort resync of the vault secret from the active DB setting.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Hardened auth header helper
-- ---------------------------------------------------------------------------
-- Previously LANGUAGE sql, and it built 'Bearer ' || NULL => JSON null when the
-- secret was missing. pg_net then sent a garbage Authorization header and the
-- failure surfaced as a remote 401 rather than a local error. Failing here
-- instead means the fault lands in cron.job_run_details where it is greppable.
CREATE OR REPLACE FUNCTION public._agent_cron_auth_header()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF v_secret IS NULL OR btrim(v_secret) = '' THEN
    RAISE EXCEPTION
      'cron auth unavailable: vault secret "email_queue_service_role_key" is missing or empty. '
      'Set it with: SELECT vault.create_secret(''<service_role_key>'', ''email_queue_service_role_key'');';
  END IF;

  RETURN jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || btrim(v_secret)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public._agent_cron_auth_header() FROM PUBLIC;

COMMENT ON FUNCTION public._agent_cron_auth_header() IS
  'Builds the pg_cron -> Edge Function Authorization header by reading the '
  'service-role key from vault AT CALL TIME. Never bake the key into '
  'cron.job.command - that is what broke every agent on 2026-07-22.';

-- ---------------------------------------------------------------------------
-- 2. Offline preflight for the stored key
-- ---------------------------------------------------------------------------
-- Catches the failure classes that produced this outage, with no network call:
--   - secret absent or blank
--   - anon key pasted in place of the service_role key (role claim check)
--   - a JWT from a previous project or an expired one (exp claim check)
-- Accepts both the legacy JWT format and the newer opaque sb_secret_* keys.
CREATE OR REPLACE FUNCTION public.cron_auth_preflight()
RETURNS TABLE (ok boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  v_secret  text;
  v_parts   text[];
  v_payload jsonb;
  v_role    text;
  v_exp     bigint;
  v_b64     text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RETURN QUERY SELECT false, 'vault secret "email_queue_service_role_key" does not exist';
    RETURN;
  END IF;

  v_secret := btrim(v_secret);

  IF v_secret = '' THEN
    RETURN QUERY SELECT false, 'vault secret exists but is empty';
    RETURN;
  END IF;

  -- Newer opaque key format - nothing to decode, only shape is checkable.
  IF v_secret LIKE 'sb_secret_%' THEN
    RETURN QUERY SELECT true, 'opaque service key (sb_secret_*) present; shape ok, claims not introspectable';
    RETURN;
  END IF;

  IF v_secret LIKE 'sb_publishable_%' OR v_secret LIKE 'sb_anon_%' THEN
    RETURN QUERY SELECT false, 'stored key is a PUBLISHABLE/ANON key, not the service key - edge calls will 401';
    RETURN;
  END IF;

  v_parts := string_to_array(v_secret, '.');
  IF array_length(v_parts, 1) IS DISTINCT FROM 3 THEN
    RETURN QUERY SELECT false, 'stored key is neither a 3-part JWT nor an sb_secret_* key';
    RETURN;
  END IF;

  -- base64url -> base64, then pad to a multiple of 4 so decode() accepts it.
  v_b64 := translate(v_parts[2], '-_', '+/');
  v_b64 := v_b64 || repeat('=', (4 - (length(v_b64) % 4)) % 4);

  BEGIN
    v_payload := convert_from(decode(v_b64, 'base64'), 'utf8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'stored key has a JWT shape but its payload will not decode';
    RETURN;
  END;

  v_role := v_payload ->> 'role';
  v_exp  := NULLIF(v_payload ->> 'exp', '')::bigint;

  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN QUERY SELECT false,
      format('stored key has role=%L, expected service_role - edge calls will 401',
             COALESCE(v_role, '<none>'));
    RETURN;
  END IF;

  IF v_exp IS NOT NULL AND to_timestamp(v_exp) <= now() THEN
    RETURN QUERY SELECT false,
      format('service_role key EXPIRED at %s', to_timestamp(v_exp)::text);
    RETURN;
  END IF;

  RETURN QUERY SELECT true,
    format('service_role key valid%s',
           CASE WHEN v_exp IS NULL THEN ''
                ELSE ', expires ' || to_timestamp(v_exp)::text END);
END;
$fn$;

REVOKE ALL ON FUNCTION public.cron_auth_preflight() FROM PUBLIC;

COMMENT ON FUNCTION public.cron_auth_preflight() IS
  'Offline structural validation of the pg_cron service-role key. Run after '
  'any key rotation: SELECT * FROM public.cron_auth_preflight();';

-- ---------------------------------------------------------------------------
-- 3. Regression gate: which jobs still carry a baked credential
-- ---------------------------------------------------------------------------
-- Detection is deliberately broad: ANY literal bearer token of realistic
-- length in a job command is baked, because a correctly-wired job carries no
-- 'Bearer' text at all (it lives inside the helper's body). An earlier,
-- narrower pattern that required 'Authorization' and 'Bearer' to sit in the
-- same comma-free run missed jsonb_build_object('Authorization','Bearer x')
-- entirely - the exact shape a hand-scheduled job takes.
--
-- The character class stops at a quote or whitespace, so a legitimate
-- concatenation ('Bearer ' || key) is not flagged. Over-flagging is cheap
-- anyway: an unrecognised shape is reported and skipped, never rewritten.
CREATE OR REPLACE FUNCTION public.cron_jobs_with_baked_credentials()
RETURNS TABLE (jobid bigint, jobname text, schedule text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $fn$
  SELECT j.jobid, j.jobname, j.schedule
  FROM cron.job j
  WHERE j.command ~* 'Bearer\s+[A-Za-z0-9._~+/=-]{4,}'
  ORDER BY j.jobname;
$fn$;

REVOKE ALL ON FUNCTION public.cron_jobs_with_baked_credentials() FROM PUBLIC;

COMMENT ON FUNCTION public.cron_jobs_with_baked_credentials() IS
  'Regression gate. Must return zero rows. A non-empty result means some '
  'migration re-introduced a literal bearer token into cron.job.command, '
  'which breaks silently on the next key rotation.';

-- ---------------------------------------------------------------------------
-- 4. Rewrite every live job to resolve its credential at run time
-- ---------------------------------------------------------------------------
-- Operates on cron.job directly rather than editing the seven historical
-- migrations, so it catches jobs regardless of which migration created them -
-- including any scheduled by hand in the SQL editor.
--
-- cron.alter_job is used instead of unschedule+schedule so jobid, schedule,
-- database, username and the active flag are all preserved.
--
-- Exposed as a function rather than an inline DO block so the test suite can
-- exercise this exact code path against seeded jobs, and so it can be re-run
-- by hand after any future migration that regresses.
--
-- Ownership note. cron.job carries RLS (username = CURRENT_USER) and pg_cron
-- separately refuses cron.alter_job on a job you do not own. In practice a
-- project accumulates jobs under more than one role - migrations run as
-- postgres, anything scheduled from the SQL editor lands under supabase_admin.
-- This function is deliberately SECURITY INVOKER. A SECURITY DEFINER version
-- is pinned to its owner and can therefore only ever fix that one role's jobs:
-- created by a migration it is owned by postgres, so it fails on every job
-- scheduled from the SQL editor as supabase_admin - and postgres holds only
-- SELECT on cron.job, so the fallback cannot rescue it either. Running as the
-- caller means a superuser fixes everything and postgres fixes its own jobs.
-- Visibility is not lost: postgres carries BYPASSRLS as a role attribute, so
-- it still sees every row of cron.job regardless of the RLS policy.
--
-- It tries cron.alter_job first, then a direct catalog UPDATE. Failures are
-- counted and warned about per job; one unfixable job must not abort the
-- whole migration, and must stay visible to the regression gate.
DROP FUNCTION IF EXISTS public.rewrite_cron_baked_credentials();

CREATE FUNCTION public.rewrite_cron_baked_credentials()
RETURNS TABLE (rewritten int, skipped int, failed int)
LANGUAGE plpgsql
SET search_path = public, cron
AS $fn$
DECLARE
  r           record;
  v_new_cmd   text;
  v_rewritten int := 0;
  v_skipped   int := 0;
  v_failed    int := 0;
  v_ok        boolean;
  v_err       text;
BEGIN
  FOR r IN
    SELECT j.jobid, j.jobname, j.command, j.username
    FROM cron.job j
    WHERE j.command ~* 'Bearer\s+[A-Za-z0-9._~+/=-]{4,}'
  LOOP
    -- Replace the whole quoted-literal headers argument with a helper call.
    -- The header literal is single-quoted JSON, and JSON uses double quotes
    -- internally, so [^']* cannot run past the closing delimiter.
    v_new_cmd := regexp_replace(
      r.command,
      'headers\s*:=\s*''[^'']*''\s*::\s*jsonb',
      'headers:=public._agent_cron_auth_header()',
      'gi'
    );

    IF v_new_cmd = r.command THEN
      -- Bearer token present but not in the expected headers:='...'::jsonb
      -- shape. Do not guess - report it for manual review.
      v_skipped := v_skipped + 1;
      -- The command is echoed so an operator can fix it, but the token is
      -- redacted first: RAISE WARNING goes to the Postgres log, and a stale
      -- credential is still a credential.
      RAISE WARNING
        'cron job % (id %) carries a bearer token in an unrecognised form; rewrite it by hand: %',
        r.jobname, r.jobid,
        regexp_replace(r.command, 'Bearer\s+[A-Za-z0-9._~+/=-]+',
                       'Bearer <redacted>', 'gi');
      CONTINUE;
    END IF;

    -- Preferred path: the supported API, valid when we own the job.
    v_ok := false;
    BEGIN
      PERFORM cron.alter_job(r.jobid, command := v_new_cmd);
      v_ok := true;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;

    -- Fallback for jobs owned by another role. Succeeds only for a caller
    -- with UPDATE on cron.job (its owner, or a superuser); otherwise the job
    -- is counted as failed and left untouched for a privileged operator.
    -- pg_cron re-reads cron.job, so an applied change is picked up.
    IF NOT v_ok THEN
      BEGIN
        UPDATE cron.job SET command = v_new_cmd WHERE jobid = r.jobid;
        v_ok := FOUND;
      EXCEPTION WHEN OTHERS THEN
        v_err := v_err || ' / ' || SQLERRM;
        v_ok := false;
      END;
    END IF;

    IF v_ok THEN
      v_rewritten := v_rewritten + 1;
      RAISE NOTICE 'rewrote cron job % (id %) to resolve credentials at run time',
        r.jobname, r.jobid;
    ELSE
      v_failed := v_failed + 1;
      RAISE WARNING 'could not rewrite cron job % (id %, owner %): %',
        r.jobname, r.jobid, r.username, v_err;
    END IF;
  END LOOP;

  RAISE NOTICE 'cron credential rewrite complete: % rewritten, % skipped, % failed',
    v_rewritten, v_skipped, v_failed;

  RETURN QUERY SELECT v_rewritten, v_skipped, v_failed;
END;
$fn$;

REVOKE ALL ON FUNCTION public.rewrite_cron_baked_credentials() FROM PUBLIC;

COMMENT ON FUNCTION public.rewrite_cron_baked_credentials() IS
  'Rewrites any cron.job command holding a literal bearer token so it calls '
  'public._agent_cron_auth_header() at run time instead. Idempotent.';

-- Apply it now.
DO $$
DECLARE
  v_rewritten int;
  v_skipped   int;
  v_failed    int;
BEGIN
  SELECT x.rewritten, x.skipped, x.failed INTO v_rewritten, v_skipped, v_failed
  FROM public.rewrite_cron_baked_credentials() x;
  RAISE NOTICE 'migration rewrote % job(s), skipped %, failed %',
    v_rewritten, v_skipped, v_failed;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Make async HTTP outcomes visible
-- ---------------------------------------------------------------------------
-- job_run_details reports the net.http_post ENQUEUE, not the response, which
-- is why a month of 401s looked healthy. pg_net records the real outcome in
-- net._http_response; this view lifts it into public for the health dashboard.
DO $$
BEGIN
  IF to_regclass('net._http_response') IS NULL THEN
    RAISE NOTICE 'pg_net response table not present - skipping cron_http_failures view';
    RETURN;
  END IF;

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.cron_http_failures AS
    SELECT
      r.id,
      r.status_code,
      r.error_msg,
      r.created,
      left(COALESCE(r.content, ''), 500) AS content_preview
    FROM net._http_response r
    WHERE r.status_code IS NULL
       OR r.status_code >= 400
    ORDER BY r.created DESC
  $view$;

  EXECUTE 'REVOKE ALL ON public.cron_http_failures FROM PUBLIC';

  EXECUTE $c$
    COMMENT ON VIEW public.cron_http_failures IS
      'Failed outbound pg_net calls. pg_cron marks a run succeeded once the '
      'request is queued, so this view - not job_run_details - is where a '
      'stale-credential 401 storm actually shows up.'
  $c$;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Best-effort vault resync
-- ---------------------------------------------------------------------------
-- Rewriting the jobs points them all at one secret; that secret still has to
-- hold the CURRENT key. Supabase does not reliably expose the service key to
-- SQL, so this is opportunistic: if a setting is readable we sync from it,
-- otherwise we print the exact manual command and leave the vault untouched.
DO $$
DECLARE
  v_key      text;
  v_existing uuid;
  v_current  text;
BEGIN
  v_key := COALESCE(
    NULLIF(btrim(COALESCE(current_setting('app.settings.service_role_key', true), '')), ''),
    NULLIF(btrim(COALESCE(current_setting('app.service_role_key', true), '')), '')
  );

  IF v_key IS NULL THEN
    RAISE NOTICE
      'No service-role key readable from DB settings - vault left as-is. '
      'Verify with: SELECT * FROM public.cron_auth_preflight();';
    RETURN;
  END IF;



  SELECT id INTO v_existing FROM vault.secrets
  WHERE name = 'email_queue_service_role_key';

  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      v_key, 'email_queue_service_role_key',
      'Service-role key used by pg_cron to call Edge Functions. Resolved at run time.');
    RAISE NOTICE 'created vault secret email_queue_service_role_key';
  ELSE
    SELECT decrypted_secret INTO v_current
    FROM vault.decrypted_secrets WHERE id = v_existing;

    IF v_current IS DISTINCT FROM v_key THEN
      PERFORM vault.update_secret(
        v_existing, v_key, 'email_queue_service_role_key',
        'Service-role key used by pg_cron to call Edge Functions. Resolved at run time.');
      RAISE NOTICE 'vault secret email_queue_service_role_key resynced from DB setting';
    ELSE
      RAISE NOTICE 'vault secret already matches the DB setting - no change';
    END IF;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Report final state
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_baked int;
  v_ok    boolean;
  v_detail text;
BEGIN
  SELECT count(*) INTO v_baked FROM public.cron_jobs_with_baked_credentials();
  SELECT p.ok, p.detail INTO v_ok, v_detail FROM public.cron_auth_preflight() p;

  RAISE NOTICE 'jobs still carrying baked credentials: %', v_baked;
  RAISE NOTICE 'key preflight: ok=% detail=%', v_ok, v_detail;

  IF v_baked > 0 THEN
    RAISE WARNING
      '% cron job(s) still hold a literal bearer token - see the warnings above.',
      v_baked;
  END IF;

  IF NOT v_ok THEN
    RAISE WARNING
      'Cron credential is NOT usable: %. Agents will stay silent until this is fixed.',
      v_detail;
  END IF;
END;
$$;
