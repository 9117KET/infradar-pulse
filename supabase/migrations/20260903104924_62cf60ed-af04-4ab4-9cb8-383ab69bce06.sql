ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS provenance text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projects'::regclass AND conname = 'projects_provenance_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_provenance_check
      CHECK (provenance IS NULL OR provenance IN ('official_registry', 'human_verified', 'ai_agent'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_provenance ON public.projects(provenance);

UPDATE public.projects SET provenance = 'ai_agent'
WHERE provenance IS NULL AND ai_generated = true;

ALTER TABLE public.quality_scores
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS calculated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS contradiction_penalty integer NOT NULL DEFAULT 0;

UPDATE public.quality_scores SET calculated_at = created_at
WHERE created_at IS NOT NULL AND calculated_at > created_at;

CREATE INDEX IF NOT EXISTS idx_quality_scores_candidate ON public.quality_scores(candidate_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_scores_project ON public.quality_scores(project_id, calculated_at DESC);