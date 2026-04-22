-- Atomic quota consumption: increments both daily and hourly counters in a single
-- transaction and returns whether the new counts are within caps. If either cap
-- would be exceeded, the function returns ok=false and the increments are rolled back.
--
-- This prevents the TOCTOU race where N parallel requests all read "used = limit-1"
-- and then all increment to limit, exceeding the cap.
CREATE OR REPLACE FUNCTION public.consume_quota(
  p_user_id uuid,
  p_metric text,
  p_daily_cap integer,
  p_hourly_cap integer
)
RETURNS TABLE(ok boolean, used_day integer, used_hour integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'utc')::date;
  v_hour timestamptz := date_trunc('hour', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
  v_hour_metric text := p_metric || ':hour:' || to_char(v_hour AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24');
  v_new_day integer;
  v_new_hour integer;
BEGIN
  -- Bump daily counter atomically
  INSERT INTO public.usage_counters (user_id, metric, period_start, count)
  VALUES (p_user_id, p_metric, v_day, 1)
  ON CONFLICT (user_id, metric, period_start)
  DO UPDATE SET count = public.usage_counters.count + 1, updated_at = now()
  RETURNING count INTO v_new_day;

  -- Bump hourly counter atomically (separate metric key so daily counter is preserved)
  INSERT INTO public.usage_counters (user_id, metric, period_start, count)
  VALUES (p_user_id, v_hour_metric, v_day, 1)
  ON CONFLICT (user_id, metric, period_start)
  DO UPDATE SET count = public.usage_counters.count + 1, updated_at = now()
  RETURNING count INTO v_new_hour;

  -- Enforce caps using the post-increment values. If over, raise to roll back the txn.
  IF p_daily_cap > 0 AND v_new_day > p_daily_cap THEN
    RAISE EXCEPTION 'OVER_DAILY_CAP'
      USING ERRCODE = 'P0001',
            DETAIL  = format('day=%s cap=%s', v_new_day, p_daily_cap);
  END IF;

  IF p_hourly_cap > 0 AND v_new_hour > p_hourly_cap THEN
    RAISE EXCEPTION 'OVER_HOURLY_CAP'
      USING ERRCODE = 'P0001',
            DETAIL  = format('hour=%s cap=%s', v_new_hour, p_hourly_cap);
  END IF;

  RETURN QUERY SELECT true, v_new_day, v_new_hour, ''::text;
END;
$$;

-- Wrapper that catches the over-cap exceptions and converts them to a row,
-- so the caller can branch without dealing with raised errors.
CREATE OR REPLACE FUNCTION public.try_consume_quota(
  p_user_id uuid,
  p_metric text,
  p_daily_cap integer,
  p_hourly_cap integer
)
RETURNS TABLE(ok boolean, used_day integer, used_hour integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.consume_quota(p_user_id, p_metric, p_daily_cap, p_hourly_cap);
EXCEPTION
  WHEN sqlstate 'P0001' THEN
    -- Over-cap: report as ok=false. Counters are rolled back by the failed txn.
    IF SQLERRM = 'OVER_DAILY_CAP' THEN
      RETURN QUERY SELECT false, p_daily_cap, 0, 'daily'::text;
    ELSIF SQLERRM = 'OVER_HOURLY_CAP' THEN
      RETURN QUERY SELECT false, 0, p_hourly_cap, 'hourly'::text;
    ELSE
      RAISE;
    END IF;
END;
$$;

-- Index to keep the hourly bucket lookups fast as rows accumulate.
CREATE INDEX IF NOT EXISTS idx_usage_counters_user_metric_period
  ON public.usage_counters(user_id, metric, period_start);

-- Housekeeping: hourly buckets accumulate ~24 rows per user per metric per day.
-- Add a function admins can call (or a cron) to prune old hourly rows. We keep
-- 7 days for auditability, then delete.
CREATE OR REPLACE FUNCTION public.prune_old_usage_counters()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.usage_counters
  WHERE metric LIKE '%:hour:%'
    AND period_start < (now() AT TIME ZONE 'utc')::date - INTERVAL '7 days';
$$;