-- Security hardening: tighten RLS on projects, insights, subscribers, research_tasks.
-- Relies on public.has_role() from 20260328123719_64e59fea-ccee-4133-94f3-fa1134cbf28b.sql

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'researcher');
$$;

COMMENT ON FUNCTION public.is_staff(uuid) IS 'True if user is admin or researcher (elevated dashboard access).';

-- ─── research_tasks: attribute user-driven runs; restrict client visibility ───
ALTER TABLE public.research_tasks
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.research_tasks.requested_by IS 'Auth user who started this task (e.g. user-research); NULL for system/cron jobs.';

DROP POLICY IF EXISTS "Public read access" ON public.research_tasks;
DROP POLICY IF EXISTS "Auth users insert research_tasks" ON public.research_tasks;
DROP POLICY IF EXISTS "Auth users update research_tasks" ON public.research_tasks;

-- Authenticated users see their own tasks, or staff sees all (including legacy NULL requested_by).
CREATE POLICY "Users read own research_tasks or staff read all"
ON public.research_tasks
FOR SELECT
TO authenticated
USING (
  public.is_staff(auth.uid())
  OR (requested_by IS NOT NULL AND requested_by = auth.uid())
);

-- Optional direct client inserts (e.g. future flows): must set self as requester.
CREATE POLICY "Users insert own research_tasks"
ON public.research_tasks
FOR INSERT
TO authenticated
WITH CHECK (requested_by = auth.uid());

-- No routine client updates; edge functions use service_role and bypass RLS.
CREATE POLICY "Staff update research_tasks"
ON public.research_tasks
FOR UPDATE
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- ─── projects: restrict mutating rows you do not own (unless staff) ───
DROP POLICY IF EXISTS "Auth users insert projects" ON public.projects;
DROP POLICY IF EXISTS "Auth users can update projects" ON public.projects;
DROP POLICY IF EXISTS "Auth users can delete projects" ON public.projects;

-- Insert: creator and/or saver must be the current user (cannot assign others).
CREATE POLICY "Auth users insert projects scoped to self"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (
  (created_by IS NULL OR created_by = auth.uid())
  AND (research_saved_by IS NULL OR research_saved_by = auth.uid())
  AND (created_by = auth.uid() OR research_saved_by = auth.uid())
);

CREATE POLICY "Auth users update projects scoped or staff"
ON public.projects
FOR UPDATE
TO authenticated
USING (
  public.is_staff(auth.uid())
  OR created_by = auth.uid()
  OR research_saved_by = auth.uid()
)
WITH CHECK (
  public.is_staff(auth.uid())
  OR created_by = auth.uid()
  OR research_saved_by = auth.uid()
);

CREATE POLICY "Auth users delete projects scoped or staff"
ON public.projects
FOR DELETE
TO authenticated
USING (
  public.is_staff(auth.uid())
  OR created_by = auth.uid()
  OR research_saved_by = auth.uid()
);

-- ─── insights: only staff may mutate; drafts not readable by non-staff ───
DROP POLICY IF EXISTS "Auth users read all insights" ON public.insights;
DROP POLICY IF EXISTS "Auth users manage insights" ON public.insights;
DROP POLICY IF EXISTS "Auth users update insights" ON public.insights;
DROP POLICY IF EXISTS "Auth users delete insights" ON public.insights;

CREATE POLICY "Staff read all insights including drafts"
ON public.insights
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff insert insights"
ON public.insights
FOR INSERT
TO authenticated
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff update insights"
ON public.insights
FOR UPDATE
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff delete insights"
ON public.insights
FOR DELETE
TO authenticated
USING (public.is_staff(auth.uid()));

-- ─── subscribers: marketing list; only admins list PII ───
DROP POLICY IF EXISTS "Auth users can read subscribers" ON public.subscribers;

CREATE POLICY "Admins read subscribers"
ON public.subscribers
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
