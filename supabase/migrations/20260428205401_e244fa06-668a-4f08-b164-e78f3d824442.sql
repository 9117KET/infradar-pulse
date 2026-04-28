DROP POLICY IF EXISTS "Auth read verification log" ON public.project_verification_log;
DROP POLICY IF EXISTS "Auth insert verification log" ON public.project_verification_log;

CREATE POLICY "Staff can read verification log"
ON public.project_verification_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can insert own verification log"
ON public.project_verification_log
FOR INSERT
TO authenticated
WITH CHECK (
  performed_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'researcher'::public.app_role)
  )
);