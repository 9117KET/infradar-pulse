ALTER TABLE public.source_registry
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS idx_source_registry_last_failure_at
  ON public.source_registry (last_failure_at DESC NULLS LAST);

ALTER TABLE public.project_claims
  ADD COLUMN IF NOT EXISTS project_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.project_claims'::regclass
      AND conname = 'project_claims_project_id_fkey'
  ) THEN
    ALTER TABLE public.project_claims
      ADD CONSTRAINT project_claims_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END;
$$;

ALTER TABLE public.project_claims
  ALTER COLUMN candidate_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.project_claims'::regclass
      AND conname = 'project_claims_project_or_candidate_check'
  ) THEN
    ALTER TABLE public.project_claims
      ADD CONSTRAINT project_claims_project_or_candidate_check
      CHECK (project_id IS NOT NULL OR candidate_id IS NOT NULL);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_project_claims_project
  ON public.project_claims(project_id);

CREATE INDEX IF NOT EXISTS idx_project_claims_candidate
  ON public.project_claims(candidate_id);