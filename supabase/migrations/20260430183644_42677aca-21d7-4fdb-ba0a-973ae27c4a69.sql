-- report_runs
CREATE TABLE IF NOT EXISTS public.report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type text NOT NULL,
  title text,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running',
  markdown text,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_report_runs_user ON public.report_runs(user_id, created_at DESC);
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own report runs" ON public.report_runs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(),'admin'::public.app_role)
         OR public.has_role(auth.uid(),'researcher'::public.app_role));
CREATE POLICY "Users insert own report runs" ON public.report_runs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
              OR public.has_role(auth.uid(),'admin'::public.app_role)
              OR public.has_role(auth.uid(),'researcher'::public.app_role));
CREATE POLICY "Users update own report runs" ON public.report_runs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(),'admin'::public.app_role)
         OR public.has_role(auth.uid(),'researcher'::public.app_role))
  WITH CHECK (user_id = auth.uid()
              OR public.has_role(auth.uid(),'admin'::public.app_role)
              OR public.has_role(auth.uid(),'researcher'::public.app_role));

-- dataset_snapshots
CREATE TABLE IF NOT EXISTS public.dataset_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_key text NOT NULL,
  generated_by text NOT NULL DEFAULT 'agent',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dataset_snapshots_key ON public.dataset_snapshots(dataset_key, created_at DESC);
ALTER TABLE public.dataset_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage dataset_snapshots" ON public.dataset_snapshots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'researcher'::public.app_role));