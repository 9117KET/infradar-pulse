-- lovable-cron-fallback-reviewed: 96 runs/day; bounded backfill queue needs a maximum 15-minute start delay and the runner exits immediately when idle.
CREATE OR REPLACE FUNCTION public.acquire_backfill_runner_lock(p_holder text, p_lease_minutes integer DEFAULT 20)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until timestamptz;
BEGIN
  IF p_holder IS NULL OR btrim(p_holder) = '' OR p_lease_minutes < 1 OR p_lease_minutes > 120 THEN
    RETURN false;
  END IF;
  INSERT INTO public.backfill_runner_locks (lock_name, lease_until, holder, updated_at)
  VALUES ('backfill-runner', now() + make_interval(mins => p_lease_minutes), p_holder, now())
  ON CONFLICT (lock_name) DO NOTHING;
  SELECT lease_until INTO v_until
  FROM public.backfill_runner_locks
  WHERE lock_name = 'backfill-runner'
  FOR UPDATE;
  IF v_until IS NOT NULL AND v_until > now() THEN
    RETURN false;
  END IF;
  UPDATE public.backfill_runner_locks
  SET lease_until = now() + make_interval(mins => p_lease_minutes), holder = p_holder, updated_at = now()
  WHERE lock_name = 'backfill-runner';
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_backfill_runner_lock(p_holder text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.backfill_runner_locks
  SET lease_until = NULL, holder = NULL, updated_at = now()
  WHERE lock_name = 'backfill-runner' AND holder = p_holder;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_backfill_runner_lock(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_backfill_runner_lock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_backfill_runner_lock(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_backfill_runner_lock(text) TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('backfill-runner-15m');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'backfill-runner-15m',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/backfill-runner',
      headers := public._agent_cron_auth_header(),
      body    := '{}'::jsonb);
  $$
);