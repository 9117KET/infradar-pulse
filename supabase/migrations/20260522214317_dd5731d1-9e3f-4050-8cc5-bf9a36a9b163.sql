ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS follow_up_step smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follow_up_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_subscribers_followup
  ON public.subscribers (type, follow_up_step, created_at);