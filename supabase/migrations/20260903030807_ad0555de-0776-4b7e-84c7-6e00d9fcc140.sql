CREATE TABLE IF NOT EXISTS public.ingest_cursors (
  agent_key text PRIMARY KEY,
  next_offset integer NOT NULL DEFAULT 0,
  exhausted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ingest_cursors TO authenticated;
GRANT ALL ON public.ingest_cursors TO service_role;

ALTER TABLE public.ingest_cursors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read ingest_cursors" ON public.ingest_cursors;
CREATE POLICY "Staff can read ingest_cursors"
  ON public.ingest_cursors
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'researcher'::public.app_role)
  );