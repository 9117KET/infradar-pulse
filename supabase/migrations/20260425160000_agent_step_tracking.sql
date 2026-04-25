-- Add current_step column to research_tasks so agents can emit real
-- progress updates that the monitoring UI can render accurately.
-- Values are free-form strings (e.g. "Searching", "Extracting", "Saving").
-- NULL means the agent hasn't reported a step yet.

ALTER TABLE public.research_tasks
  ADD COLUMN IF NOT EXISTS current_step TEXT;

COMMENT ON COLUMN public.research_tasks.current_step IS
  'Current workflow step reported by the agent (Searching, Extracting, Analyzing, Saving, etc.)';
