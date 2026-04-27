-- Track demo request follow-up email sequence state.
-- Step 0 = initial confirmation sent (default)
-- Step 1 = day-3 follow-up sent
-- Step 2 = day-7 follow-up sent
-- Step -1 = unsubscribed / opted out

ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS follow_up_step    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follow_up_sent_at timestamptz;

-- Index so the scheduler can quickly find demo_request rows ready for the next step
CREATE INDEX IF NOT EXISTS idx_subscribers_followup
  ON public.subscribers (type, follow_up_step, created_at)
  WHERE type = 'demo_request';
