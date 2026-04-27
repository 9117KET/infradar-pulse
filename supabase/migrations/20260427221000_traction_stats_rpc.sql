-- Admin-only RPC that returns aggregated traction metrics.
-- SECURITY DEFINER runs as the function owner so it can read across all rows.

CREATE OR REPLACE FUNCTION public.get_traction_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  -- Only admins may call this
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT json_build_object(
    -- Sign-up counts
    'total_signups',         (SELECT count(*)::int FROM public.profiles),
    'signups_this_week',     (SELECT count(*)::int FROM public.profiles
                               WHERE created_at > now() - interval '7 days'),
    'signups_last_week',     (SELECT count(*)::int FROM public.profiles
                               WHERE created_at BETWEEN now() - interval '14 days'
                                                    AND now() - interval '7 days'),
    -- Paid vs free
    'paid_subscribers',      (SELECT count(*)::int FROM public.subscriptions
                               WHERE status = 'active'
                                 AND plan_key NOT IN ('free', 'trialing')),
    'active_trials',         (SELECT count(*)::int FROM public.subscriptions
                               WHERE status = 'trialing'),
    -- Plan distribution (active or trialing)
    'plan_breakdown',        (
      SELECT json_agg(json_build_object('plan', plan_key, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT plan_key, count(*)::int AS cnt
        FROM public.subscriptions
        WHERE status IN ('active', 'trialing')
        GROUP BY plan_key
      ) t
    ),
    -- Acquisition channel distribution
    'channel_breakdown',     (
      SELECT json_agg(json_build_object('source', src, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT COALESCE(acq_source, 'direct') AS src, count(*)::int AS cnt
        FROM public.profiles
        GROUP BY src
        ORDER BY cnt DESC
        LIMIT 10
      ) t
    ),
    -- Demo requests
    'demo_requests_week',    (SELECT count(*)::int FROM public.subscribers
                               WHERE type = 'demo_request'
                                 AND created_at > now() - interval '7 days'),
    'demo_requests_total',   (SELECT count(*)::int FROM public.subscribers
                               WHERE type = 'demo_request'),
    'newsletter_total',      (SELECT count(*)::int FROM public.subscribers
                               WHERE type = 'newsletter'),
    -- Referrals
    'referral_signups',      (SELECT count(*)::int FROM public.referral_events),
    'referral_conversions',  (SELECT count(*)::int FROM public.referral_events
                               WHERE converted_to_paid = true),
    -- Weekly signup trend (last 12 weeks)
    'weekly_signups',        (
      SELECT json_agg(json_build_object('week', week_start, 'count', cnt) ORDER BY week_start)
      FROM (
        SELECT date_trunc('week', created_at)::date AS week_start,
               count(*)::int AS cnt
        FROM public.profiles
        WHERE created_at > now() - interval '12 weeks'
        GROUP BY week_start
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_traction_stats() TO authenticated;
