ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.alerts;
DROP POLICY IF EXISTS "Auth users update alerts" ON public.alerts;
DROP POLICY IF EXISTS "Paid users and staff can read alerts" ON public.alerts;
DROP POLICY IF EXISTS "Staff can update alerts" ON public.alerts;

CREATE POLICY "Paid users and staff can read alerts"
ON public.alerts
FOR SELECT
TO authenticated
USING (public.has_paid_or_staff_access(auth.uid(), 'live'));

CREATE POLICY "Staff can update alerts"
ON public.alerts
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);