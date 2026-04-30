
-- 1) Alerts table
CREATE TABLE IF NOT EXISTS public.agent_health_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,                    -- 'cron_auth_failure' | 'cron_failure_spike'
  severity text NOT NULL DEFAULT 'high',       -- 'critical' | 'high' | 'medium' | 'low'
  job_name text,                               -- cron jobname affected (nullable for fleet-wide)
  failure_count integer NOT NULL DEFAULT 0,
  total_runs integer NOT NULL DEFAULT 0,
  sample_message text,                         -- truncated last error from cron.job_run_details
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_health_alerts_open
  ON public.agent_health_alerts (detected_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_health_alerts_type_job
  ON public.agent_health_alerts (alert_type, job_name, detected_at DESC);

ALTER TABLE public.agent_health_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages agent_health_alerts" ON public.agent_health_alerts;
CREATE POLICY "Service role manages agent_health_alerts"
  ON public.agent_health_alerts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Staff view agent_health_alerts" ON public.agent_health_alerts;
CREATE POLICY "Staff view agent_health_alerts"
  ON public.agent_health_alerts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'researcher'::public.app_role));

DROP POLICY IF EXISTS "Staff resolve agent_health_alerts" ON public.agent_health_alerts;
CREATE POLICY "Staff resolve agent_health_alerts"
  ON public.agent_health_alerts
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'researcher'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'researcher'::public.app_role));

-- 2) Per-job cron health for the dashboard (last N hours)
CREATE OR REPLACE FUNCTION public.get_agent_cron_health(p_hours integer DEFAULT 24)
RETURNS TABLE (
  job_name text,
  total_runs integer,
  failed_runs integer,
  auth_failures integer,
  failure_rate_pct numeric,
  last_run_at timestamptz,
  last_failure_at timestamptz,
  last_failure_message text,
  suspected_auth_failure boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
  WITH allowed AS (
    SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'researcher'::public.app_role) AS ok
  ),
  runs AS (
    SELECT
      j.jobname,
      d.status,
      d.return_message,
      d.start_time
    FROM cron.job j
    JOIN cron.job_run_details d ON d.jobid = j.jobid
    WHERE d.start_time > now() - make_interval(hours => GREATEST(p_hours, 1))
      AND (SELECT ok FROM allowed)
  ),
  agg AS (
    SELECT
      jobname AS job_name,
      count(*)::int AS total_runs,
      count(*) FILTER (WHERE status <> 'succeeded')::int AS failed_runs,
      count(*) FILTER (
        WHERE status <> 'succeeded'
        AND (
          return_message ILIKE '%401%'
          OR return_message ILIKE '%unauthorized%'
          OR return_message ILIKE '%invalid jwt%'
          OR return_message ILIKE '%jwt expired%'
          OR return_message ILIKE '%missing authorization%'
          OR return_message ILIKE '%invalid api key%'
        )
      )::int AS auth_failures,
      max(start_time) AS last_run_at,
      max(start_time) FILTER (WHERE status <> 'succeeded') AS last_failure_at,
      (
        SELECT left(r2.return_message, 500)
        FROM runs r2
        WHERE r2.jobname = r.jobname AND r2.status <> 'succeeded'
        ORDER BY r2.start_time DESC
        LIMIT 1
      ) AS last_failure_message
    FROM runs r
    GROUP BY jobname
  )
  SELECT
    a.job_name,
    a.total_runs,
    a.failed_runs,
    a.auth_failures,
    CASE WHEN a.total_runs > 0
         THEN round(100.0 * a.failed_runs / a.total_runs, 1)
         ELSE 0 END AS failure_rate_pct,
    a.last_run_at,
    a.last_failure_at,
    a.last_failure_message,
    (a.auth_failures > 0) AS suspected_auth_failure
  FROM agg a
  ORDER BY a.auth_failures DESC, a.failed_runs DESC, a.job_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_agent_cron_health(integer) TO authenticated;

-- 3) Detection function used by the edge monitor (service role only callers in practice)
CREATE OR REPLACE FUNCTION public.detect_agent_auth_failures(p_hours integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
DECLARE
  v_jobs jsonb;
  v_total int := 0;
  v_jobs_count int := 0;
BEGIN
  WITH runs AS (
    SELECT j.jobname, d.status, d.return_message, d.start_time
    FROM cron.job j
    JOIN cron.job_run_details d ON d.jobid = j.jobid
    WHERE d.start_time > now() - make_interval(hours => GREATEST(p_hours, 1))
  ),
  per_job AS (
    SELECT
      jobname AS job_name,
      count(*) FILTER (
        WHERE status <> 'succeeded'
        AND (
          return_message ILIKE '%401%'
          OR return_message ILIKE '%unauthorized%'
          OR return_message ILIKE '%invalid jwt%'
          OR return_message ILIKE '%jwt expired%'
          OR return_message ILIKE '%missing authorization%'
          OR return_message ILIKE '%invalid api key%'
        )
      )::int AS auth_failures,
      count(*)::int AS total_runs,
      max(start_time) AS last_run_at,
      (
        SELECT left(r2.return_message, 500)
        FROM runs r2
        WHERE r2.jobname = r.jobname AND r2.status <> 'succeeded'
        ORDER BY r2.start_time DESC LIMIT 1
      ) AS sample_message
    FROM runs r
    GROUP BY jobname
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'job_name', job_name,
        'auth_failures', auth_failures,
        'total_runs', total_runs,
        'last_run_at', last_run_at,
        'sample_message', sample_message
      ) ORDER BY auth_failures DESC
    ) FILTER (WHERE auth_failures > 0), '[]'::jsonb),
    COALESCE(sum(auth_failures), 0)::int,
    count(*) FILTER (WHERE auth_failures > 0)::int
  INTO v_jobs, v_total, v_jobs_count
  FROM per_job;

  RETURN jsonb_build_object(
    'window_hours', p_hours,
    'total_auth_failures', v_total,
    'affected_job_count', v_jobs_count,
    'jobs', v_jobs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.detect_agent_auth_failures(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_agent_auth_failures(integer) TO authenticated, service_role;

-- 4) Auto-resolve helper used after a successful run is detected on follow-up
CREATE OR REPLACE FUNCTION public.resolve_agent_auth_alerts(p_job_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.agent_health_alerts
  SET resolved_at = now()
  WHERE alert_type = 'cron_auth_failure'
    AND job_name = p_job_name
    AND resolved_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_agent_auth_alerts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_agent_auth_alerts(text) TO service_role;

-- 5) Helper to fetch admin emails for the monitor (service role only)
CREATE OR REPLACE FUNCTION public.list_admin_emails()
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id, u.email::text
  FROM auth.users u
  JOIN public.user_roles r ON r.user_id = u.id
  WHERE r.role = 'admin'::public.app_role
    AND u.email IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.list_admin_emails() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_emails() TO service_role;
