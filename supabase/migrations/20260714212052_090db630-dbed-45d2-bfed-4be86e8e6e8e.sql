
-- 1. Fix mutable search_path on functions
ALTER FUNCTION public.safe_cast_project_sector(text) SET search_path = public;
ALTER FUNCTION public.safe_cast_project_stage(text)  SET search_path = public;
ALTER FUNCTION public.safe_cast_project_status(text) SET search_path = public;
ALTER FUNCTION public.safe_cast_project_region(text) SET search_path = public;
ALTER FUNCTION public.touch_outreach_updated_at()    SET search_path = public;

-- 2. Restrict service-role write policies (drop and recreate scoped to service_role)
DROP POLICY IF EXISTS contractors_service_write ON public.contractors;
CREATE POLICY contractors_service_write ON public.contractors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS contractor_awards_service_write ON public.contractor_awards;
CREATE POLICY contractor_awards_service_write ON public.contractor_awards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tender_events_service_write ON public.tender_events;
CREATE POLICY tender_events_service_write ON public.tender_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS health_history_insert_service ON public.project_health_history;
CREATE POLICY health_history_insert_service ON public.project_health_history
  FOR INSERT TO service_role WITH CHECK (true);

-- 3. Gate contractors/contractor_awards/tender_events SELECT behind paid/staff access
DROP POLICY IF EXISTS contractors_read ON public.contractors;
CREATE POLICY contractors_read ON public.contractors
  FOR SELECT TO authenticated
  USING (public.has_paid_or_staff_access(auth.uid(), 'live'));

DROP POLICY IF EXISTS contractor_awards_read ON public.contractor_awards;
CREATE POLICY contractor_awards_read ON public.contractor_awards
  FOR SELECT TO authenticated
  USING (public.has_paid_or_staff_access(auth.uid(), 'live'));

DROP POLICY IF EXISTS tender_events_read ON public.tender_events;
CREATE POLICY tender_events_read ON public.tender_events
  FOR SELECT TO authenticated
  USING (public.has_paid_or_staff_access(auth.uid(), 'live'));

-- 4. Remove redundant public-role duplicate SELECT policy on insights
--    (the {authenticated} policy with the same predicate remains, and anon
--     access to published insights is served through server-side paths).
DROP POLICY IF EXISTS "Public read published insights" ON public.insights;

-- 5. Tighten project_contacts SELECT to real paid subscribers, lifetime grants,
--    pilot access, or staff -- excluding low-friction no-card trial grants.
CREATE OR REPLACE FUNCTION public.has_paid_contact_access(_user_id uuid, check_env text DEFAULT 'live')
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'researcher'::public.app_role)
    OR public.has_active_pilot_access(_user_id, check_env)
    OR EXISTS (
      SELECT 1 FROM public.lifetime_grants lg
      WHERE lg.user_id = _user_id AND lg.environment = check_env
    )
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.environment = check_env
        AND s.status IN ('active', 'trialing', 'past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_paid_contact_access(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Paid users and staff can read contacts" ON public.project_contacts;
CREATE POLICY "Paid subscribers and staff can read contacts" ON public.project_contacts
  FOR SELECT TO authenticated
  USING (public.has_paid_contact_access(auth.uid(), 'live'));
