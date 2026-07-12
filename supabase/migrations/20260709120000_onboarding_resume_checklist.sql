-- Resumable onboarding wizard + DB-backed getting-started checklist.
-- onboarding_step: last wizard step the user reached (resume point across devices).
-- checklist_dismissed_at: when the user dismissed the dashboard getting-started checklist (NULL = visible).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checklist_dismissed_at timestamptz;
