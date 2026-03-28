CREATE TABLE public.project_verification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  action text NOT NULL,
  reason text NOT NULL DEFAULT '',
  performed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_verification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read verification log" ON public.project_verification_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert verification log" ON public.project_verification_log FOR INSERT TO authenticated WITH CHECK (true);