
CREATE TABLE public.tracked_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, project_id)
);

ALTER TABLE public.tracked_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own tracked projects"
  ON public.tracked_projects FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own tracked projects"
  ON public.tracked_projects FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own tracked projects"
  ON public.tracked_projects FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own tracked projects"
  ON public.tracked_projects FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
