CREATE TABLE public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  company text,
  role text,
  company_size text,
  interest text,
  challenge text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public form)
CREATE POLICY "Anyone can insert waitlist" ON public.waitlist
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Only authenticated users can read
CREATE POLICY "Auth users can read waitlist" ON public.waitlist
FOR SELECT TO authenticated
USING (true);