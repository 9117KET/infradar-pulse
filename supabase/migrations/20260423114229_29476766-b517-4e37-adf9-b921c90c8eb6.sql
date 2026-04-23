CREATE TYPE public.feedback_type AS ENUM ('bug', 'idea', 'praise', 'other');
CREATE TYPE public.feedback_status AS ENUM ('new', 'triaged', 'in_progress', 'resolved', 'wont_fix');

CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  type public.feedback_type NOT NULL DEFAULT 'other',
  message text NOT NULL,
  page text,
  user_agent text,
  status public.feedback_status NOT NULL DEFAULT 'new',
  admin_notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_message_length CHECK (char_length(trim(message)) BETWEEN 3 AND 4000),
  CONSTRAINT feedback_email_length CHECK (email IS NULL OR char_length(email) <= 255),
  CONSTRAINT feedback_page_length CHECK (page IS NULL OR char_length(page) <= 500),
  CONSTRAINT feedback_ua_length CHECK (user_agent IS NULL OR char_length(user_agent) <= 1000)
);

CREATE INDEX feedback_user_id_idx ON public.feedback(user_id);
CREATE INDEX feedback_status_idx ON public.feedback(status);
CREATE INDEX feedback_created_at_idx ON public.feedback(created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit feedback"
  ON public.feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(trim(message)) BETWEEN 3 AND 4000
    AND (email IS NULL OR char_length(email) <= 255)
  );

CREATE POLICY "Users view own feedback"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins view all feedback"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update feedback"
  ON public.feedback FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete feedback"
  ON public.feedback FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));