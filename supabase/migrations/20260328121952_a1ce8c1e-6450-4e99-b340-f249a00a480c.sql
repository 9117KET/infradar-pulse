
CREATE TABLE public.subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  company text,
  type text NOT NULL DEFAULT 'newsletter',
  preferences jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe" ON public.subscribers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Auth users can read subscribers" ON public.subscribers FOR SELECT TO authenticated USING (true);
