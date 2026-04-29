DROP POLICY IF EXISTS "Public can view all projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can view projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can view approved projects" ON public.projects;
DROP POLICY IF EXISTS "Public can view approved projects" ON public.projects;
DROP POLICY IF EXISTS "Staff can view all projects" ON public.projects;

CREATE POLICY "Public can view approved projects"
ON public.projects
FOR SELECT
TO anon, authenticated
USING (approved = true);

CREATE POLICY "Staff can view all projects"
ON public.projects
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);