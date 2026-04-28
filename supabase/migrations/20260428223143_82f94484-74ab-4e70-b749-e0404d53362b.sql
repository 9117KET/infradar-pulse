CREATE TABLE IF NOT EXISTS public.user_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  anonymous_id text NULL,
  session_id text NOT NULL,
  event_name text NOT NULL,
  event_category text NOT NULL DEFAULT 'product',
  page_path text NULL,
  referrer text NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_key text NULL,
  roles text[] NOT NULL DEFAULT '{}'::text[],
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_events_created_at ON public.user_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_user_created ON public.user_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_events_session_created ON public.user_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_event_created ON public.user_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_properties_gin ON public.user_events USING gin(properties);

DROP POLICY IF EXISTS "Service role can insert user events" ON public.user_events;
CREATE POLICY "Service role can insert user events"
ON public.user_events
FOR INSERT
TO public
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can read user events" ON public.user_events;
CREATE POLICY "Admins can read user events"
ON public.user_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Service role can manage user events" ON public.user_events;
CREATE POLICY "Service role can manage user events"
ON public.user_events
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.get_product_analytics_summary(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT jsonb_build_object(
    'days', v_days,
    'total_events', (SELECT count(*)::integer FROM public.user_events WHERE created_at >= now() - make_interval(days => v_days)),
    'active_users', (SELECT count(DISTINCT user_id)::integer FROM public.user_events WHERE user_id IS NOT NULL AND created_at >= now() - make_interval(days => v_days)),
    'anonymous_visitors', (SELECT count(DISTINCT anonymous_id)::integer FROM public.user_events WHERE user_id IS NULL AND anonymous_id IS NOT NULL AND created_at >= now() - make_interval(days => v_days)),
    'sessions', (SELECT count(DISTINCT session_id)::integer FROM public.user_events WHERE created_at >= now() - make_interval(days => v_days)),
    'paywall_views', (SELECT count(*)::integer FROM public.user_events WHERE event_name = 'paywall_viewed' AND created_at >= now() - make_interval(days => v_days)),
    'signouts_after_paywall', (
      SELECT count(DISTINCT p.session_id)::integer
      FROM public.user_events p
      JOIN public.user_events s ON s.session_id = p.session_id
       AND s.event_name = 'logout_clicked'
       AND s.created_at > p.created_at
       AND s.created_at <= p.created_at + interval '30 minutes'
      WHERE p.event_name = 'paywall_viewed'
        AND p.created_at >= now() - make_interval(days => v_days)
    ),
    'top_events', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('event_name', event_name, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT event_name, count(*)::integer AS cnt
        FROM public.user_events
        WHERE created_at >= now() - make_interval(days => v_days)
        GROUP BY event_name
        ORDER BY cnt DESC
        LIMIT 20
      ) t
    ),
    'top_paywall_features', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('feature', feature, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT COALESCE(properties->>'feature', 'unknown') AS feature, count(*)::integer AS cnt
        FROM public.user_events
        WHERE event_name = 'paywall_viewed'
          AND created_at >= now() - make_interval(days => v_days)
        GROUP BY feature
        ORDER BY cnt DESC
        LIMIT 10
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_signup_funnel(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN jsonb_build_array(
    jsonb_build_object('step', 'signup_started', 'count', (SELECT count(DISTINCT COALESCE(user_id::text, anonymous_id, session_id))::integer FROM public.user_events WHERE event_name = 'signup_started' AND created_at >= now() - make_interval(days => v_days))),
    jsonb_build_object('step', 'signup_completed', 'count', (SELECT count(DISTINCT COALESCE(user_id::text, anonymous_id, session_id))::integer FROM public.user_events WHERE event_name = 'signup_completed' AND created_at >= now() - make_interval(days => v_days))),
    jsonb_build_object('step', 'login_completed', 'count', (SELECT count(DISTINCT user_id)::integer FROM public.user_events WHERE event_name = 'login_completed' AND user_id IS NOT NULL AND created_at >= now() - make_interval(days => v_days))),
    jsonb_build_object('step', 'onboarding_completed', 'count', (SELECT count(DISTINCT user_id)::integer FROM public.user_events WHERE event_name = 'onboarding_completed' AND user_id IS NOT NULL AND created_at >= now() - make_interval(days => v_days))),
    jsonb_build_object('step', 'trial_started', 'count', (SELECT count(DISTINCT user_id)::integer FROM public.user_events WHERE event_name = 'trial_started' AND user_id IS NOT NULL AND created_at >= now() - make_interval(days => v_days)))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_paywall_dropoff(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN (
    WITH paywalls AS (
      SELECT id, user_id, session_id, created_at, COALESCE(properties->>'feature', 'unknown') AS feature
      FROM public.user_events
      WHERE event_name = 'paywall_viewed'
        AND created_at >= now() - make_interval(days => v_days)
    ), outcomes AS (
      SELECT
        p.feature,
        count(*)::integer AS paywall_views,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM public.user_events e
          WHERE e.session_id = p.session_id
            AND e.created_at > p.created_at
            AND e.created_at <= p.created_at + interval '30 minutes'
            AND e.event_name = 'logout_clicked'
        ))::integer AS signouts_30m,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM public.user_events e
          WHERE e.session_id = p.session_id
            AND e.created_at > p.created_at
            AND e.created_at <= p.created_at + interval '30 minutes'
            AND e.event_name IN ('trial_started', 'checkout_started', 'pricing_page_viewed', 'quota_request_submitted')
        ))::integer AS conversion_intent_30m
      FROM paywalls p
      GROUP BY p.feature
      ORDER BY paywall_views DESC
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(outcomes)), '[]'::jsonb) FROM outcomes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_product_analytics_summary(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_signup_funnel(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_paywall_dropoff(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_analytics_summary(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_signup_funnel(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_paywall_dropoff(integer) TO authenticated;