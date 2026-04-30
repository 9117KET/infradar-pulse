
CREATE OR REPLACE FUNCTION public.upsert_vault_secret(p_name text, p_secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_name IS NULL OR p_secret IS NULL OR length(p_secret) < 20 THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name LIMIT 1;

  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_secret, p_name, 'Auto-synced from SUPABASE_SERVICE_ROLE_KEY');
    RETURN jsonb_build_object('action', 'created', 'name', p_name);
  ELSE
    PERFORM vault.update_secret(v_id, p_secret, p_name, 'Auto-synced from SUPABASE_SERVICE_ROLE_KEY');
    RETURN jsonb_build_object('action', 'updated', 'name', p_name, 'id', v_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_vault_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_vault_secret(text, text) TO service_role;
