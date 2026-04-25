-- Preserve subscription history instead of one row per user/environment
ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_user_id_environment_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_paddle_env_unique
ON public.subscriptions(paddle_subscription_id, environment);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_env_created
ON public.subscriptions(user_id, environment, created_at DESC);

-- Track scheduled plan changes separately from the current active plan.
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS scheduled_price_id text,
ADD COLUMN IF NOT EXISTS scheduled_plan_key text,
ADD COLUMN IF NOT EXISTS scheduled_change_action text,
ADD COLUMN IF NOT EXISTS scheduled_change_effective_at timestamptz;

-- Make environment-aware access checks consistent for subscriptions and lifetime grants.
CREATE OR REPLACE FUNCTION public.has_paid_or_staff_access(_user_id uuid, check_env text DEFAULT 'live'::text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'researcher'::public.app_role)
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
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'live'::text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
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
$$;

-- Keep contact/evidence premium reads tied to the live/test environment chosen by app code.
DROP POLICY IF EXISTS "Paid users and staff can read evidence" ON public.evidence_sources;
CREATE POLICY "Paid users and staff can read evidence"
ON public.evidence_sources
FOR SELECT
TO authenticated
USING (public.has_paid_or_staff_access(auth.uid(), 'live'));

DROP POLICY IF EXISTS "Paid users and staff can read contacts" ON public.project_contacts;
CREATE POLICY "Paid users and staff can read contacts"
ON public.project_contacts
FOR SELECT
TO authenticated
USING (public.has_paid_or_staff_access(auth.uid(), 'live'));
