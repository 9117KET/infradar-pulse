ALTER TABLE public.quality_scores ALTER COLUMN candidate_id DROP NOT NULL;

ALTER TABLE public.quality_scores
  ADD CONSTRAINT quality_scores_project_or_candidate
  CHECK (project_id IS NOT NULL OR candidate_id IS NOT NULL);