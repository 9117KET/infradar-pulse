CREATE OR REPLACE FUNCTION public.has_paid_or_staff_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'researcher'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.lifetime_grants lg
      WHERE lg.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.status IN ('active', 'trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    );
$$;

DROP POLICY IF EXISTS "Public read access" ON public.evidence_sources;
DROP POLICY IF EXISTS "Public read contacts" ON public.project_contacts;

CREATE POLICY "Paid users and staff can read evidence"
ON public.evidence_sources
FOR SELECT
TO authenticated
USING (public.has_paid_or_staff_access(auth.uid()));

CREATE POLICY "Paid users and staff can read contacts"
ON public.project_contacts
FOR SELECT
TO authenticated
USING (public.has_paid_or_staff_access(auth.uid()));