ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS contact_canonicalization_completed_at timestamptz;