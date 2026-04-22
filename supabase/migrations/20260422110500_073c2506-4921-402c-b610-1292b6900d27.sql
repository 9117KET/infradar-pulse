
-- Create the missing increment_usage_metric RPC that the client code calls.
-- It mirrors increment_usage_for_user but uses parameter names matching the client invocation.
CREATE OR REPLACE FUNCTION public.increment_usage_metric(metric_name text, user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usage_counters (user_id, metric, period_start, count)
  VALUES (user_uuid, metric_name, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, metric, period_start)
  DO UPDATE SET count = public.usage_counters.count + 1, updated_at = now();
END;
$$;

-- Ensure the unique index for ON CONFLICT exists (needed for both RPCs to work).
CREATE UNIQUE INDEX IF NOT EXISTS usage_counters_user_metric_period_idx
  ON public.usage_counters (user_id, metric, period_start);

-- Allow authenticated users to call the new RPC.
GRANT EXECUTE ON FUNCTION public.increment_usage_metric(text, uuid) TO authenticated;
