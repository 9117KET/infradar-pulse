-- Attribution for role-based edit/delete (plan: created vs research-saved)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS research_saved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.projects.created_by IS 'User who created the project via Project Editor.';
COMMENT ON COLUMN public.projects.research_saved_by IS 'User who saved this row from Research → review queue.';
