-- Replay safety: no_card_trial_grants was created via the hosted dashboard and
-- never committed as a migration. The SQL functions below reference it at
-- creation time (LANGUAGE sql bodies are validated), so fresh local replays
-- fail without it. Shape mirrors the generated types (types.ts). No-op on
-- hosted where the table already exists.
CREATE TABLE IF NOT EXISTS public.no_card_trial_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  environment text NOT NULL DEFAULT 'live',
  status text NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_no_card_trial_grants_user_env
  ON public.no_card_trial_grants(user_id, environment);
CREATE INDEX IF NOT EXISTS idx_no_card_trial_grants_email_env
  ON public.no_card_trial_grants(email_normalized, environment);

ALTER TABLE public.no_card_trial_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own trial grant" ON public.no_card_trial_grants;
CREATE POLICY "Users read own trial grant" ON public.no_card_trial_grants
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages trial grants" ON public.no_card_trial_grants;
CREATE POLICY "Service role manages trial grants" ON public.no_card_trial_grants
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

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