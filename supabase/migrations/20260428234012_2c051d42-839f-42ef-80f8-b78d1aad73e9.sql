CREATE OR REPLACE FUNCTION public.get_traction_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'total_signups',         (SELECT count(*)::int FROM public.profiles),
    'signups_this_week',     (SELECT count(*)::int FROM public.profiles WHERE created_at > now() - interval '7 days'),
    'signups_last_week',     (SELECT count(*)::int FROM public.profiles WHERE created_at BETWEEN now() - interval '14 days' AND now() - interval '7 days'),
    'paid_subscribers',      (SELECT count(*)::int FROM public.subscriptions WHERE status = 'active' AND COALESCE(plan_key, '') NOT IN ('free', 'trialing')),
    'active_trials',         (SELECT count(*)::int FROM public.subscriptions WHERE status = 'trialing'),
    'plan_breakdown',        (
      SELECT COALESCE(json_agg(json_build_object('plan', plan_key, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
      FROM (
        SELECT COALESCE(plan_key, 'unknown') AS plan_key, count(*)::int AS cnt
        FROM public.subscriptions
        WHERE status IN ('active', 'trialing')
        GROUP BY COALESCE(plan_key, 'unknown')
      ) t
    ),
    'channel_breakdown',     (
      SELECT COALESCE(json_agg(json_build_object('source', src, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
      FROM (
        SELECT COALESCE(acq_source, 'direct') AS src, count(*)::int AS cnt
        FROM public.profiles
        GROUP BY src
        ORDER BY cnt DESC
        LIMIT 10
      ) t
    ),
    'demo_requests_week',    (SELECT count(*)::int FROM public.subscribers WHERE type = 'demo_request' AND created_at > now() - interval '7 days'),
    'demo_requests_total',   (SELECT count(*)::int FROM public.subscribers WHERE type = 'demo_request'),
    'newsletter_total',      (SELECT count(*)::int FROM public.subscribers WHERE type = 'newsletter'),
    'referral_signups',      (SELECT count(*)::int FROM public.referral_events),
    'referral_conversions',  (SELECT count(*)::int FROM public.referral_events WHERE converted_to_paid = true),
    'weekly_signups',        (
      SELECT COALESCE(json_agg(json_build_object('week', week_start, 'count', cnt) ORDER BY week_start), '[]'::json)
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

REVOKE ALL ON FUNCTION public.get_traction_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_traction_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';