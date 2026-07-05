
-- project_updates: only expose change history for approved projects
DROP POLICY IF EXISTS "Public read access" ON public.project_updates;
CREATE POLICY "Approved project updates are public"
  ON public.project_updates FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'researcher'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_updates.project_id AND p.approved = true
    )
  );

-- project_milestones: only expose milestones for approved projects
DROP POLICY IF EXISTS "Public read access" ON public.project_milestones;
CREATE POLICY "Approved project milestones are public"
  ON public.project_milestones FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'researcher'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_milestones.project_id AND p.approved = true
    )
  );

-- project_stakeholders: only expose stakeholders for approved projects
DROP POLICY IF EXISTS "Public read access" ON public.project_stakeholders;
CREATE POLICY "Approved project stakeholders are public"
  ON public.project_stakeholders FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'researcher'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_stakeholders.project_id AND p.approved = true
    )
  );
