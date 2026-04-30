ALTER TABLE public.project_candidates
  ADD COLUMN IF NOT EXISTS canonical_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES public.project_candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_confidence INTEGER;

CREATE INDEX IF NOT EXISTS idx_project_candidates_canonical ON public.project_candidates(canonical_project_id);
CREATE INDEX IF NOT EXISTS idx_project_candidates_duplicate_of ON public.project_candidates(duplicate_of);

NOTIFY pgrst, 'reload schema';