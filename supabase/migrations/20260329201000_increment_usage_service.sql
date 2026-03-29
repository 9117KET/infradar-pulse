-- Atomic increment for Edge Functions (service role); avoids read-modify-write races.
CREATE OR REPLACE FUNCTION public.increment_usage_for_user(p_user_id uuid, p_metric text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (timezone('utc', now()))::date;
BEGIN
  INSERT INTO public.usage_counters (user_id, metric, period_start, count)
  VALUES (p_user_id, p_metric, today, 1)
  ON CONFLICT (user_id, metric, period_start)
  DO UPDATE SET count = public.usage_counters.count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_usage_for_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_usage_for_user(uuid, text) TO service_role;
