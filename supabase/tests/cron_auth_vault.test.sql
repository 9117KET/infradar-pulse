-- Test suite for 20260828120000_cron_auth_via_vault.sql
--
-- Runs entirely inside a transaction that is rolled back, so it is safe to run
-- against ANY database including production - it creates throwaway cron jobs
-- and vault secrets, asserts, then discards everything.
--
--   npm run test:cron-auth          (local)
--   npm run test:cron-auth:prod     (read-only-equivalent, rolled back)
--
-- Any failed assertion aborts the transaction with a visible message.

BEGIN;

-- ---------------------------------------------------------------------------
-- Test helpers (temp schema - vanish with the session)
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.assert(cond boolean, msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', msg;
  END IF;
  RAISE NOTICE '  ok - %', msg;
END;
$$;

-- base64url with no padding and no line wrapping. Postgres' encode() breaks
-- base64 output every 76 chars, which would corrupt the token.
CREATE FUNCTION pg_temp.b64url(t text) RETURNS text
LANGUAGE sql AS $$
  SELECT rtrim(
    translate(replace(encode(convert_to(t, 'utf8'), 'base64'), E'\n', ''), '+/', '-_'),
    '=');
$$;

CREATE FUNCTION pg_temp.mk_jwt(payload jsonb) RETURNS text
LANGUAGE sql AS $$
  SELECT pg_temp.b64url('{"alg":"HS256","typ":"JWT"}')
      || '.' || pg_temp.b64url(payload::text)
      || '.' || 'not-a-real-signature';
$$;

CREATE FUNCTION pg_temp.set_secret(val text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'email_queue_service_role_key';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(val, 'email_queue_service_role_key', 'test');
  ELSE
    PERFORM vault.update_secret(v_id, val, 'email_queue_service_role_key', 'test');
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.clear_secret() RETURNS void
LANGUAGE sql AS $$
  DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
$$;

-- Preserve whatever the database really holds; restored implicitly by ROLLBACK.
CREATE TEMP TABLE saved_secret AS
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key';

-- ===========================================================================
-- GROUP 1 - cron_auth_preflight() classifies every failure mode we have seen
-- ===========================================================================
DO $$
DECLARE v_ok boolean; v_detail text;
BEGIN
  RAISE NOTICE 'GROUP 1: cron_auth_preflight()';

  -- 1.1 missing secret
  PERFORM pg_temp.clear_secret();
  SELECT p.ok, p.detail INTO v_ok, v_detail FROM public.cron_auth_preflight() p;
  PERFORM pg_temp.assert(v_ok = false, 'missing secret -> not ok');
  PERFORM pg_temp.assert(v_detail LIKE '%does not exist%', 'missing secret -> explains why');

  -- 1.2 blank secret
  PERFORM pg_temp.set_secret('   ');
  SELECT p.ok, p.detail INTO v_ok, v_detail FROM public.cron_auth_preflight() p;
  PERFORM pg_temp.assert(v_ok = false, 'blank secret -> not ok');

  -- 1.3 anon key pasted in place of the service key. This is the single most
  --     common rotation mistake and it 401s identically to a stale key.
  PERFORM pg_temp.set_secret(pg_temp.mk_jwt(jsonb_build_object(
    'role', 'anon', 'iss', 'supabase',
    'exp', extract(epoch from now() + interval '1 year')::bigint)));
  SELECT p.ok, p.detail INTO v_ok, v_detail FROM public.cron_auth_preflight() p;
  PERFORM pg_temp.assert(v_ok = false, 'anon-role JWT -> not ok');
  PERFORM pg_temp.assert(v_detail LIKE '%role%', 'anon-role JWT -> names the role problem');

  -- 1.4 expired service_role JWT
  PERFORM pg_temp.set_secret(pg_temp.mk_jwt(jsonb_build_object(
    'role', 'service_role', 'iss', 'supabase',
    'exp', extract(epoch from now() - interval '1 day')::bigint)));
  SELECT p.ok, p.detail INTO v_ok, v_detail FROM public.cron_auth_preflight() p;
  PERFORM pg_temp.assert(v_ok = false, 'expired service_role JWT -> not ok');
  PERFORM pg_temp.assert(v_detail LIKE '%EXPIRED%', 'expired JWT -> says EXPIRED');

  -- 1.5 valid service_role JWT
  PERFORM pg_temp.set_secret(pg_temp.mk_jwt(jsonb_build_object(
    'role', 'service_role', 'iss', 'supabase',
    'exp', extract(epoch from now() + interval '5 years')::bigint)));
  SELECT p.ok, p.detail INTO v_ok, v_detail FROM public.cron_auth_preflight() p;
  PERFORM pg_temp.assert(v_ok = true, 'valid service_role JWT -> ok');

  -- 1.6 service_role JWT with no exp claim is still acceptable
  PERFORM pg_temp.set_secret(pg_temp.mk_jwt(
    jsonb_build_object('role', 'service_role', 'iss', 'supabase')));
  SELECT p.ok, p.detail INTO v_ok, v_detail FROM public.cron_auth_preflight() p;
  PERFORM pg_temp.assert(v_ok = true, 'service_role JWT without exp -> ok');

  -- 1.7 new-style opaque secret key. Built by concatenation so the literal
  --     never matches a real key pattern - secret scanners flag the shape,
  --     not the value, and a test fixture must not look like a credential.
  PERFORM pg_temp.set_secret('sb_secret_' || 'example-placeholder-value');
  SELECT p.ok, p.detail INTO v_ok, v_detail FROM public.cron_auth_preflight() p;
  PERFORM pg_temp.assert(v_ok = true, 'sb_secret_* key -> ok');

  -- 1.8 new-style publishable key must be rejected
  PERFORM pg_temp.set_secret('sb_publishable_' || 'example-placeholder-value');
  SELECT p.ok, p.detail INTO v_ok, v_detail FROM public.cron_auth_preflight() p;
  PERFORM pg_temp.assert(v_ok = false, 'sb_publishable_* key -> rejected');

  -- 1.9 arbitrary garbage
  PERFORM pg_temp.set_secret('hunter2');
  SELECT p.ok, p.detail INTO v_ok, v_detail FROM public.cron_auth_preflight() p;
  PERFORM pg_temp.assert(v_ok = false, 'non-JWT garbage -> rejected');
END;
$$;

-- ===========================================================================
-- GROUP 2 - _agent_cron_auth_header() fails loudly instead of silently
-- ===========================================================================
DO $$
DECLARE v_hdr jsonb; v_raised boolean;
BEGIN
  RAISE NOTICE 'GROUP 2: _agent_cron_auth_header()';

  -- 2.1 missing secret must RAISE, not return a null Authorization value.
  --     The old LANGUAGE sql version returned {"Authorization": null} here,
  --     which is precisely how the outage stayed invisible inside Postgres.
  PERFORM pg_temp.clear_secret();
  v_raised := false;
  BEGIN
    PERFORM public._agent_cron_auth_header();
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  PERFORM pg_temp.assert(v_raised, 'missing secret -> helper raises');

  -- 2.2 empty secret must also raise
  PERFORM pg_temp.set_secret('');
  v_raised := false;
  BEGIN
    PERFORM public._agent_cron_auth_header();
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  PERFORM pg_temp.assert(v_raised, 'empty secret -> helper raises');

  -- 2.3 present secret produces a well-formed header
  PERFORM pg_temp.set_secret('test-service-key-abc');
  v_hdr := public._agent_cron_auth_header();
  PERFORM pg_temp.assert(
    v_hdr ->> 'Authorization' = 'Bearer test-service-key-abc',
    'present secret -> correct Bearer header');
  PERFORM pg_temp.assert(
    v_hdr ->> 'Content-Type' = 'application/json',
    'present secret -> Content-Type set');

  -- 2.4 the header tracks the vault LIVE - this is the whole point of the fix
  PERFORM pg_temp.set_secret('rotated-key-xyz');
  v_hdr := public._agent_cron_auth_header();
  PERFORM pg_temp.assert(
    v_hdr ->> 'Authorization' = 'Bearer rotated-key-xyz',
    'rotating the vault secret changes the header with no re-scheduling');
END;
$$;

-- ===========================================================================
-- GROUP 3 - the rewriter, against real production command shapes
-- ===========================================================================
DO $$
DECLARE
  v_cmd        text;
  v_rewritten  int;
  v_skipped    int;
  v_jobid      bigint;
  v_jobid_after bigint;
  v_baked      int;
BEGIN
  RAISE NOTICE 'GROUP 3: rewrite_cron_baked_credentials()';

  PERFORM pg_temp.set_secret('test-service-key-abc');

  -- Seed jobs copied verbatim in SHAPE from the affected migrations. The token
  -- values are deliberately not JWT-shaped: these tests only assert that the
  -- literal is removed, and a JWT-looking fixture trips secret scanners.
  -- 3.a 20260421000001 style (format() with jsonb_build_object header)
  PERFORM cron.schedule('t-baked-research', '*/30 * * * *',
    $q$SELECT net.http_post(url:='https://x.supabase.co/functions/v1/research-agent', headers:='{"Content-Type": "application/json", "Authorization": "Bearer stale-token-placeholder-one"}'::jsonb, body:='{}'::jsonb)$q$);

  -- 3.b 20260706121000 style, non-empty body with JSON payload
  PERFORM cron.schedule('t-baked-backfill', '5 * * * *',
    $q$SELECT net.http_post(url:='https://x.supabase.co/functions/v1/world-bank-ingest-agent', headers:='{"Content-Type": "application/json", "Authorization": "Bearer stale-token-placeholder-two"}'::jsonb, body:='{"mode":"backfill","status":"Active,Pipeline,Closed","limit":500}'::jsonb)$q$);

  -- 3.c already-correct job must be left completely alone
  PERFORM cron.schedule('t-clean-job', '0 */2 * * *',
    $q$SELECT net.http_post(url:='https://x.supabase.co/functions/v1/update-checker', headers:=public._agent_cron_auth_header(), body:='{"scheduled": true}'::jsonb)$q$);

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 't-baked-research';

  -- Pre-condition: the gate sees the two baked jobs.
  SELECT count(*) INTO v_baked FROM public.cron_jobs_with_baked_credentials()
   WHERE jobname LIKE 't-%';
  PERFORM pg_temp.assert(v_baked = 2, 'gate detects exactly the 2 seeded baked jobs');

  -- Run the real function.
  SELECT x.rewritten, x.skipped INTO v_rewritten, v_skipped
  FROM public.rewrite_cron_baked_credentials() x;
  PERFORM pg_temp.assert(v_rewritten >= 2, 'rewriter reports >= 2 rewritten');
  PERFORM pg_temp.assert(v_skipped = 0, 'rewriter skipped nothing');

  -- 3.1 gate is now clean
  SELECT count(*) INTO v_baked FROM public.cron_jobs_with_baked_credentials()
   WHERE jobname LIKE 't-%';
  PERFORM pg_temp.assert(v_baked = 0, 'no seeded job carries a bearer token any more');

  -- 3.2 header replaced with the helper call
  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 't-baked-research';
  PERFORM pg_temp.assert(v_cmd LIKE '%public._agent_cron_auth_header()%',
    'baked job now calls the helper');
  PERFORM pg_temp.assert(v_cmd NOT LIKE '%Bearer%',
    'baked job no longer contains the literal token');

  -- 3.3 everything else about the command is preserved
  PERFORM pg_temp.assert(
    v_cmd LIKE '%functions/v1/research-agent%', 'url preserved');
  PERFORM pg_temp.assert(v_cmd LIKE '%body:=%', 'body argument preserved');

  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 't-baked-backfill';
  PERFORM pg_temp.assert(
    v_cmd LIKE '%"mode":"backfill","status":"Active,Pipeline,Closed","limit":500%',
    'complex JSON body preserved byte-for-byte');

  -- 3.4 jobid and schedule survive (cron.alter_job, not unschedule+schedule)
  SELECT jobid INTO v_jobid_after FROM cron.job WHERE jobname = 't-baked-research';
  PERFORM pg_temp.assert(v_jobid_after = v_jobid, 'jobid preserved across rewrite');
  PERFORM pg_temp.assert(
    (SELECT schedule FROM cron.job WHERE jobname = 't-baked-research') = '*/30 * * * *',
    'schedule preserved across rewrite');
  PERFORM pg_temp.assert(
    (SELECT active FROM cron.job WHERE jobname = 't-baked-research'),
    'job left active');

  -- 3.5 the already-correct job was not touched
  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 't-clean-job';
  PERFORM pg_temp.assert(v_cmd LIKE '%_agent_cron_auth_header()%'
                     AND v_cmd LIKE '%"scheduled": true%',
    'already-correct job untouched');

  -- 3.6 idempotency - a second run is a no-op
  SELECT x.rewritten, x.skipped INTO v_rewritten, v_skipped
  FROM public.rewrite_cron_baked_credentials() x;
  PERFORM pg_temp.assert(v_rewritten = 0 AND v_skipped = 0,
    'second run is a no-op (idempotent)');

  PERFORM cron.unschedule('t-baked-research');
  PERFORM cron.unschedule('t-baked-backfill');
  PERFORM cron.unschedule('t-clean-job');
END;
$$;

-- ===========================================================================
-- GROUP 4 - unrecognised shapes are reported, never mangled
-- ===========================================================================
DO $$
DECLARE
  v_cmd text; v_rewritten int; v_skipped int;
BEGIN
  RAISE NOTICE 'GROUP 4: unrecognised token shapes';

  -- A bearer token that is not inside a headers:='...'::jsonb literal. The
  -- rewriter must refuse to guess and must leave the command byte-identical.
  PERFORM cron.schedule('t-weird-shape', '0 1 * * *',
    $q$SELECT net.http_post(url:='https://x.supabase.co/f', headers:=jsonb_build_object('Authorization','Bearer hardcoded-inline'), body:='{}'::jsonb)$q$);

  SELECT x.rewritten, x.skipped INTO v_rewritten, v_skipped
  FROM public.rewrite_cron_baked_credentials() x;
  PERFORM pg_temp.assert(v_skipped = 1, 'unrecognised shape counted as skipped');
  PERFORM pg_temp.assert(v_rewritten = 0, 'unrecognised shape not rewritten');

  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 't-weird-shape';
  PERFORM pg_temp.assert(v_cmd LIKE '%Bearer hardcoded-inline%',
    'unrecognised command left byte-identical for manual review');

  -- and it stays visible to the gate so it cannot be forgotten
  PERFORM pg_temp.assert(
    EXISTS (SELECT 1 FROM public.cron_jobs_with_baked_credentials()
             WHERE jobname = 't-weird-shape'),
    'unrecognised job still flagged by the regression gate');

  PERFORM cron.unschedule('t-weird-shape');
END;
$$;

-- ===========================================================================
-- GROUP 5 - end-to-end simulation of the actual 2026-07-22 outage
-- ===========================================================================
DO $$
DECLARE
  v_hdr_before jsonb;
  v_hdr_after  jsonb;
  v_cmd        text;
BEGIN
  RAISE NOTICE 'GROUP 5: rotation simulation';

  -- Before: a job with the old key baked in.
  PERFORM pg_temp.set_secret('stale-service-key-aaaaaaaa');
  PERFORM cron.schedule('t-sim', '*/30 * * * *',
    $q$SELECT net.http_post(url:='https://x.supabase.co/functions/v1/research-agent', headers:='{"Content-Type": "application/json", "Authorization": "Bearer stale-service-key-aaaaaaaa"}'::jsonb, body:='{}'::jsonb)$q$);

  PERFORM public.rewrite_cron_baked_credentials();
  v_hdr_before := public._agent_cron_auth_header();
  PERFORM pg_temp.assert(v_hdr_before ->> 'Authorization' = 'Bearer stale-service-key-aaaaaaaa',
    'pre-rotation: helper serves the old key');

  -- Rotate the project keys. Under the OLD design every job would now be
  -- sending stale-service-key-aaaaaaaa forever. Under the new design we touch only the vault.
  PERFORM pg_temp.set_secret('fresh-service-key-bbbbbbbb');

  v_hdr_after := public._agent_cron_auth_header();
  PERFORM pg_temp.assert(
    v_hdr_after ->> 'Authorization' = 'Bearer fresh-service-key-bbbbbbbb',
    'post-rotation: helper serves the new key immediately');

  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 't-sim';
  PERFORM pg_temp.assert(v_cmd NOT LIKE '%stale-service-key-aaaaaaaa%',
    'post-rotation: no job holds a stale key');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.cron_jobs_with_baked_credentials()
      WHERE jobname = 't-sim') = 0,
    'post-rotation: regression gate stays clean without re-running any migration');

  PERFORM cron.unschedule('t-sim');
END;
$$;

-- ===========================================================================
-- GROUP 7 - jobs owned by another role (regression test)
-- ===========================================================================
-- cron.job carries RLS (username = CURRENT_USER) and pg_cron independently
-- refuses cron.alter_job on a job you do not own. A real project accumulates
-- jobs under several roles - migrations run as postgres, anything scheduled
-- from the SQL editor lands under supabase_admin. The first version of the
-- rewriter used cron.alter_job alone and aborted the whole migration with
-- "Job N does not exist or you don't own it" against a faithful replay of
-- production. This locks in the fallback path.
DO $$
DECLARE
  v_cmd text; v_rewritten int; v_failed int; v_owner text;
BEGIN
  RAISE NOTICE 'GROUP 7: foreign-owned jobs';

  -- Needs CREATEROLE. Where the connecting role lacks it (some managed
  -- setups), skip rather than fail - the rest of the suite still applies.
  -- Creating the role, becoming it, and scheduling as it are all guarded
  -- together: a non-superuser needs CREATEROLE *and* membership in the new
  -- role before SET ROLE is allowed, and either can be absent on a managed
  -- database. Any privilege failure skips the group rather than failing it.
  BEGIN
    EXECUTE 'CREATE ROLE t_cron_owner LOGIN';
    EXECUTE format('GRANT t_cron_owner TO %I', current_user);
    EXECUTE 'GRANT USAGE ON SCHEMA cron TO t_cron_owner';
    EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA cron TO t_cron_owner';
    EXECUTE 'SET LOCAL ROLE t_cron_owner';
    PERFORM cron.schedule('t-other-owner', '0 1 * * *',
      $q$SELECT net.http_post(url:='https://x.supabase.co/f', headers:='{"Content-Type": "application/json", "Authorization": "Bearer baked-token-owned-elsewhere"}'::jsonb, body:='{"a":1}'::jsonb)$q$);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege OR duplicate_object THEN
    EXECUTE 'RESET ROLE';
    RAISE NOTICE '  SKIPPED - insufficient privileges to seed a foreign-owned job here';
    RETURN;
  END;

  SELECT username INTO v_owner FROM cron.job WHERE jobname = 't-other-owner';
  PERFORM pg_temp.assert(v_owner = 't_cron_owner',
    'seeded job really is owned by another role');

  SELECT x.rewritten, x.failed INTO v_rewritten, v_failed
  FROM public.rewrite_cron_baked_credentials() x;

  -- Two outcomes are legitimate here and which one you get depends on the
  -- connecting role:
  --   * superuser / job owner  -> rewritten
  --   * plain `postgres`       -> failed, because cron.job is owned by
  --                               supabase_admin and postgres holds only
  --                               SELECT on it, so neither cron.alter_job nor
  --                               the direct-UPDATE fallback can apply.
  -- What must NEVER happen is a silent half-fix: a job that is left broken
  -- while being counted as done, or one that drops out of the gate.
  PERFORM pg_temp.assert(v_rewritten + v_failed >= 1,
    'foreign-owned job is accounted for (rewritten or reported failed)');

  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 't-other-owner';
  PERFORM pg_temp.assert(v_cmd LIKE '%{"a":1}%', 'foreign-owned job body preserved');

  IF v_rewritten >= 1 THEN
    PERFORM pg_temp.assert(v_cmd LIKE '%public._agent_cron_auth_header()%',
      'foreign-owned job now calls the helper');
    PERFORM pg_temp.assert(v_cmd NOT LIKE '%baked-token%',
      'foreign-owned job no longer holds the token');
    RAISE NOTICE '  (this role could rewrite foreign-owned jobs)';
  ELSE
    -- Reported as failed: the command must be untouched, and crucially the
    -- job must still be visible to the gate so an operator cannot lose it.
    PERFORM pg_temp.assert(v_cmd LIKE '%baked-token-owned-elsewhere%',
      'unfixable job left byte-identical, not partially rewritten');
    PERFORM pg_temp.assert(
      EXISTS (SELECT 1 FROM public.cron_jobs_with_baked_credentials()
               WHERE jobname = 't-other-owner'),
      'unfixable job still flagged by the regression gate');
    RAISE NOTICE '  (this role cannot rewrite foreign-owned jobs - correctly reported)';
  END IF;

  -- ownership must not be hijacked either way
  SELECT username INTO v_owner FROM cron.job WHERE jobname = 't-other-owner';
  PERFORM pg_temp.assert(v_owner = 't_cron_owner', 'ownership unchanged');

  -- Deliberately NOT unscheduled here: cron.unschedule enforces the same
  -- ownership rule, so the caller cannot drop another role's job. The
  -- surrounding ROLLBACK removes both the job and the role.
END;
$$;

-- ===========================================================================
-- GROUP 6 - the production database's own current state
-- ===========================================================================
-- Reports rather than asserts, so the suite still passes on a machine whose
-- vault is legitimately unconfigured (a fresh local stack). The prod runner
-- script turns these into hard failures.
DO $$
DECLARE
  v_baked int; v_total int;
BEGIN
  RAISE NOTICE 'GROUP 6: live state of this database';

  -- restore the database's real secret before reporting
  PERFORM pg_temp.clear_secret();
  IF EXISTS (SELECT 1 FROM saved_secret WHERE decrypted_secret IS NOT NULL) THEN
    PERFORM pg_temp.set_secret((SELECT decrypted_secret FROM saved_secret LIMIT 1));
  END IF;

  SELECT count(*) INTO v_total FROM cron.job;
  SELECT count(*) INTO v_baked FROM public.cron_jobs_with_baked_credentials();

  RAISE NOTICE '  cron jobs total: %', v_total;
  RAISE NOTICE '  jobs with baked credentials: %', v_baked;
  RAISE NOTICE '  key preflight: %',
    (SELECT format('ok=%s detail=%s', p.ok, p.detail)
     FROM public.cron_auth_preflight() p);
END;
$$;

DO $$ BEGIN RAISE NOTICE 'ALL CRON AUTH TESTS PASSED'; END; $$;

ROLLBACK;
