DROP POLICY IF EXISTS "Anyone can read agent config" ON public.agent_config;
DROP POLICY IF EXISTS "Staff can read agent config" ON public.agent_config;

CREATE POLICY "Staff can read agent config"
ON public.agent_config
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);