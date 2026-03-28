
CREATE TABLE public.project_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  organization text NOT NULL DEFAULT '',
  phone text,
  email text,
  source text NOT NULL DEFAULT '',
  source_url text,
  verified boolean NOT NULL DEFAULT false,
  added_by text NOT NULL DEFAULT 'ai',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read contacts" ON public.project_contacts FOR SELECT TO public USING (true);
CREATE POLICY "Auth insert contacts" ON public.project_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update contacts" ON public.project_contacts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete contacts" ON public.project_contacts FOR DELETE TO authenticated USING (true);
