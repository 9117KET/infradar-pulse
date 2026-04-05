-- Add per-user notification preference columns to profiles.
-- Previously these lived only in browser localStorage and were lost on browser clear.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_alerts  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_digest boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS critical_only boolean DEFAULT false;
