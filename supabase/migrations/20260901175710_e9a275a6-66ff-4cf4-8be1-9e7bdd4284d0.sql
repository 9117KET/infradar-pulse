DO $$
DECLARE
  v_id uuid;
  v_secret text := 'e1fc08e0b5758a1c5cef12d2591921f6ec3b298848f227ed198131b33728c56d';
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'agent_cron_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_secret, 'agent_cron_secret', 'Shared secret sent as x-cron-secret by pg_cron. Must equal the AGENT_CRON_SECRET Edge Function secret.');
  ELSE
    PERFORM vault.update_secret(v_id, v_secret, 'agent_cron_secret', 'Shared secret sent as x-cron-secret by pg_cron. Must equal the AGENT_CRON_SECRET Edge Function secret.');
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public._agent_cron_auth_header()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  v_secret text;
  v_cron   text;
  v_hdr    jsonb;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;

  SELECT decrypted_secret INTO v_cron
  FROM vault.decrypted_secrets WHERE name = 'agent_cron_secret' LIMIT 1;

  IF (v_secret IS NULL OR btrim(v_secret) = '') AND (v_cron IS NULL OR btrim(v_cron) = '') THEN
    RAISE EXCEPTION 'cron auth unavailable: neither "email_queue_service_role_key" nor "agent_cron_secret" is set in vault.';
  END IF;

  v_hdr := jsonb_build_object('Content-Type', 'application/json');

  IF v_secret IS NOT NULL AND btrim(v_secret) <> '' THEN
    v_hdr := v_hdr || jsonb_build_object('Authorization', 'Bearer ' || btrim(v_secret));
  END IF;

  IF v_cron IS NOT NULL AND btrim(v_cron) <> '' THEN
    v_hdr := v_hdr || jsonb_build_object('x-cron-secret', btrim(v_cron));
  END IF;

  RETURN v_hdr;
END;
$fn$;

REVOKE ALL ON FUNCTION public._agent_cron_auth_header() FROM PUBLIC;

COMMENT ON FUNCTION public._agent_cron_auth_header() IS
  'Builds pg_cron -> Edge Function headers at CALL TIME: service-role bearer plus the rotation-proof x-cron-secret.';

DO $$
BEGIN
  PERFORM cron.unschedule('sync-service-role-to-vault');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'sync-service-role-to-vault',
  '17 2 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/sync-service-role-to-vault',
      headers := public._agent_cron_auth_header(),
      body    := '{}'::jsonb);
  $$
);