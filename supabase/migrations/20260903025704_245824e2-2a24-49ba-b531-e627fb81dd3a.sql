ALTER TABLE public.backfill_jobs
  ADD COLUMN IF NOT EXISTS lease_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_success_at timestamp with time zone;

CREATE TABLE public.backfill_runner_locks (
  lock_name text PRIMARY KEY,
  lease_until timestamp with time zone,
  holder text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.backfill_runner_locks TO authenticated;
GRANT ALL ON public.backfill_runner_locks TO service_role;

ALTER TABLE public.backfill_runner_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view backfill runner lock"
  ON public.backfill_runner_locks
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher'));

CREATE POLICY "Service role manages backfill runner lock"
  ON public.backfill_runner_locks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.backfill_runner_locks (lock_name)
VALUES ('backfill-runner')
ON CONFLICT (lock_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_backfill_runner_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER backfill_runner_locks_updated_at
  BEFORE UPDATE ON public.backfill_runner_locks
  FOR EACH ROW EXECUTE FUNCTION public.touch_backfill_runner_lock();