-- Pull the canonical service-role key from the active Postgres setting so we
-- never have to hardcode it. `app.settings.service_role_key` is set by
-- Supabase on managed Postgres for use inside SQL. If it isn't available we
-- abort cleanly so we don't break cron further.
DO $$
DECLARE
  v_key text;
  v_existing uuid;
BEGIN
  -- Try the standard Supabase setting first
  BEGIN
    v_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE NOTICE 'Cannot self-heal vault: app.settings.service_role_key not exposed. Manual update required.';
    RETURN;
  END IF;

  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'email_queue_service_role_key';

  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(v_key, 'email_queue_service_role_key', 'Service-role JWT used by pg_cron to call edge functions (auto-synced).');
  ELSE
    PERFORM vault.update_secret(v_existing, v_key, 'email_queue_service_role_key', 'Service-role JWT used by pg_cron to call edge functions (auto-synced).');
  END IF;
END $$;