ALTER TABLE public.research_tasks
ADD COLUMN IF NOT EXISTS requested_by uuid;

CREATE INDEX IF NOT EXISTS idx_research_tasks_requested_by
ON public.research_tasks (requested_by);

CREATE INDEX IF NOT EXISTS idx_research_tasks_created_at
ON public.research_tasks (created_at DESC);

DROP POLICY IF EXISTS "Public read access" ON public.research_tasks;
DROP POLICY IF EXISTS "Auth read verification log" ON public.research_tasks;
DROP POLICY IF EXISTS "Auth users insert research_tasks" ON public.research_tasks;
DROP POLICY IF EXISTS "Auth users update research_tasks" ON public.research_tasks;
DROP POLICY IF EXISTS "Users can view own research tasks" ON public.research_tasks;
DROP POLICY IF EXISTS "Staff can view all research tasks" ON public.research_tasks;
DROP POLICY IF EXISTS "Users can create own research tasks" ON public.research_tasks;
DROP POLICY IF EXISTS "Users can update own research tasks" ON public.research_tasks;
DROP POLICY IF EXISTS "Service role can manage research tasks" ON public.research_tasks;

CREATE POLICY "Users can view own research tasks"
ON public.research_tasks
FOR SELECT
TO authenticated
USING (requested_by = auth.uid());

CREATE POLICY "Staff can view all research tasks"
ON public.research_tasks
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));

CREATE POLICY "Users can create own research tasks"
ON public.research_tasks
FOR INSERT
TO authenticated
WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Users can update own research tasks"
ON public.research_tasks
FOR UPDATE
TO authenticated
USING (requested_by = auth.uid())
WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Service role can manage research tasks"
ON public.research_tasks
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');