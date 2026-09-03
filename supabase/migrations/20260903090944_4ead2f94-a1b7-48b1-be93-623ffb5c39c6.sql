DROP POLICY IF EXISTS "Authenticated users can view companies" ON public.companies;
DROP POLICY IF EXISTS "Paid or staff users can view companies" ON public.companies;
CREATE POLICY "Paid or staff users can view companies"
ON public.companies FOR SELECT TO authenticated
USING (public.has_paid_or_staff_access(auth.uid(), 'live'::text));

DROP POLICY IF EXISTS "Authenticated users can view company roles" ON public.company_project_roles;
DROP POLICY IF EXISTS "Paid or staff users can view company roles" ON public.company_project_roles;
CREATE POLICY "Paid or staff users can view company roles"
ON public.company_project_roles FOR SELECT TO authenticated
USING (public.has_paid_or_staff_access(auth.uid(), 'live'::text));

CREATE OR REPLACE FUNCTION public.has_paid_or_staff_access(_user_id uuid, check_env text DEFAULT 'live'::text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'researcher'::public.app_role)
    OR public.has_active_pilot_access(_user_id, check_env)
    OR EXISTS (
      SELECT 1 FROM public.no_card_trial_grants nct
      WHERE nct.user_id = _user_id
        AND nct.environment = check_env
        AND nct.status = 'active'
        AND nct.ends_at > now()
    )
    OR EXISTS (
      SELECT 1 FROM public.lifetime_grants lg
      WHERE lg.user_id = _user_id
        AND lg.environment = check_env
    )
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.environment = check_env
        AND s.status IN ('active', 'trialing', 'past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    );
$function$;

CREATE OR REPLACE FUNCTION public.has_paid_contact_access(_user_id uuid, check_env text DEFAULT 'live'::text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'researcher'::public.app_role)
    OR (
      EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = _user_id AND u.email_confirmed_at IS NOT NULL
      )
      AND (
        public.has_active_pilot_access(_user_id, check_env)
        OR EXISTS (
          SELECT 1 FROM public.lifetime_grants lg
          WHERE lg.user_id = _user_id AND lg.environment = check_env
        )
        OR EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.user_id = _user_id
            AND s.environment = check_env
            AND s.status IN ('active', 'trialing')
            AND (s.current_period_end IS NULL OR s.current_period_end > now())
        )
      )
    );
$function$;