CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'live'::text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.no_card_trial_grants nct
      WHERE nct.user_id = user_uuid
        AND nct.environment = check_env
        AND nct.status = 'active'
        AND nct.ends_at > now()
    )
    OR EXISTS (
      SELECT 1 FROM public.lifetime_grants
      WHERE user_id = user_uuid AND environment = check_env
    )
    OR EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = user_uuid
        AND environment = check_env
        AND status IN ('active', 'trialing', 'past_due')
        AND (current_period_end IS NULL OR current_period_end > now())
    )
    OR EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = user_uuid
        AND environment = check_env
        AND status IN ('canceled', 'unpaid')
        AND current_period_end > now()
    );
$function$;

CREATE OR REPLACE FUNCTION public.has_paid_or_staff_access(_user_id uuid, check_env text DEFAULT 'live'::text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'researcher'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.no_card_trial_grants nct
      WHERE nct.user_id = _user_id
        AND nct.environment = check_env
        AND nct.status = 'active'
        AND nct.ends_at > now()
    )
    OR EXISTS (
      SELECT 1
      FROM public.lifetime_grants lg
      WHERE lg.user_id = _user_id
        AND lg.environment = check_env
    )
    OR EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.environment = check_env
        AND s.status IN ('active', 'trialing', 'past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    )
    OR EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.environment = check_env
        AND s.status IN ('canceled', 'unpaid')
        AND s.current_period_end > now()
    );
$function$;

CREATE OR REPLACE FUNCTION public.has_paid_or_staff_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'researcher'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.no_card_trial_grants nct
      WHERE nct.user_id = _user_id
        AND nct.status = 'active'
        AND nct.ends_at > now()
    )
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
$function$;