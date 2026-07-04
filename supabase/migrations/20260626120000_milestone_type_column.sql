-- Add milestone_type column to project_milestones.
--
-- TenderCalendar.tsx (lines 43, 59) selects `milestone_type` in its PostgREST
-- queries, but the column was never added to the schema. All requests to
-- /rest/v1/project_milestones?select=...milestone_type... returned HTTP 400
-- ("column project_milestones.milestone_type does not exist").
--
-- Values are freeform strings set by researchers when creating milestones
-- (e.g. "Tender Open", "Financial Close", "Construction Start", etc.).
-- Nullable so existing rows are unaffected.

ALTER TABLE public.project_milestones
  ADD COLUMN IF NOT EXISTS milestone_type TEXT;

-- Confirm the column exists (idempotent no-op if already added).
COMMENT ON COLUMN public.project_milestones.milestone_type
  IS 'Optional label for the kind of milestone, e.g. "Tender Open", "Financial Close", "Construction Start".';
