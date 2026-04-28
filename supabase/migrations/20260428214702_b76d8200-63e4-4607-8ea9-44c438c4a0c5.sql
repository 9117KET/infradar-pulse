DROP POLICY IF EXISTS "Auth users read all insights" ON public.insights;
DROP POLICY IF EXISTS "Authenticated users read published insights" ON public.insights;
DROP POLICY IF EXISTS "Staff can read all insights" ON public.insights;

CREATE POLICY "Authenticated users read published insights"
ON public.insights
FOR SELECT
TO authenticated
USING (published = true);

CREATE POLICY "Staff can read all insights"
ON public.insights
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);