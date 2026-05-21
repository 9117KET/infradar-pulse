CREATE OR REPLACE FUNCTION public.get_agent_http_health(p_hours integer DEFAULT 24)
RETURNS TABLE (
  job_name        text,
  total_calls     integer,
  failed_calls    integer,
  auth_failures   integer,
  server_errors   integer,
  failure_rate_pct numeric,
  last_call_at    timestamptz,
  last_failure_at timestamptz,
  last_status_code integer,
  last_error_msg  text,
  suspected_auth_failure boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, cron, net
AS $fn$
  WITH allowed AS (
    SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'researcher'::public.app_role) AS ok
  ),
  jobs AS (
    SELECT
      j.jobname,
      (regexp_match(j.command, $re$url\s*:?=\s*'([^']+)'$re$))[1] AS url
    FROM cron.job j
    WHERE j.jobname <> 'process-email-queue'
  ),
  responses AS (
    SELECT
      j.jobname,
      r.status_code,
      r.error_msg,
      r.created
    FROM net._http_response r
    JOIN net.http_request_queue q ON q.id = r.id
    JOIN jobs j ON j.url = q.url
    WHERE r.created > now() - make_interval(hours => GREATEST(p_hours, 1))
      AND (SELECT ok FROM allowed)
  ),
  agg AS (
    SELECT
      jobname AS job_name,
      count(*)::int AS total_calls,
      count(*) FILTER (WHERE status_code IS NULL OR status_code >= 400)::int AS failed_calls,
      count(*) FILTER (WHERE status_code IN (401, 403))::int AS auth_failures,
      count(*) FILTER (WHERE status_code >= 500)::int AS server_errors,
      max(created) AS last_call_at,
      max(created) FILTER (WHERE status_code IS NULL OR status_code >= 400) AS last_failure_at
    FROM responses
    GROUP BY jobname
  )
  SELECT
    a.job_name,
    a.total_calls,
    a.failed_calls,
    a.auth_failures,
    a.server_errors,
    CASE WHEN a.total_calls > 0
         THEN round(100.0 * a.failed_calls / a.total_calls, 1)
         ELSE 0 END AS failure_rate_pct,
    a.last_call_at,
    a.last_failure_at,
    (SELECT r.status_code FROM responses r WHERE r.jobname = a.job_name ORDER BY r.created DESC LIMIT 1) AS last_status_code,
    (SELECT left(r.error_msg, 500) FROM responses r WHERE r.jobname = a.job_name ORDER BY r.created DESC LIMIT 1) AS last_error_msg,
    (a.auth_failures > 0) AS suspected_auth_failure
  FROM agg a
  ORDER BY a.auth_failures DESC, a.failed_calls DESC, a.job_name;
$fn$;

REVOKE ALL ON FUNCTION public.get_agent_http_health(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_agent_http_health(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.detect_silent_agent_stoppage(p_hours integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, net
AS $fn$
DECLARE
  v_silent jsonb;
  v_count int := 0;
BEGIN
  WITH jobs AS (
    SELECT
      j.jobname,
      (regexp_match(j.command, $re$url\s*:?=\s*'([^']+)'$re$))[1] AS url
    FROM cron.job j
    WHERE j.jobname <> 'process-email-queue'
      AND j.active
  ),
  recent_responses AS (
    SELECT j.jobname, count(r.id)::int AS n
    FROM jobs j
    LEFT JOIN net.http_request_queue q ON q.url = j.url
    LEFT JOIN net._http_response r
      ON r.id = q.id
     AND r.created > now() - make_interval(hours => GREATEST(p_hours, 1))
    GROUP BY j.jobname
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object('job_name', jobname) ORDER BY jobname)
             FILTER (WHERE n = 0), '[]'::jsonb),
    count(*) FILTER (WHERE n = 0)::int
  INTO v_silent, v_count
  FROM recent_responses;

  RETURN jsonb_build_object(
    'window_hours', p_hours,
    'silent_job_count', v_count,
    'jobs', v_silent
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.detect_silent_agent_stoppage(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_silent_agent_stoppage(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.detect_agent_auth_failures(p_hours integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, net
AS $fn$
DECLARE
  v_jobs jsonb;
  v_total int := 0;
  v_jobs_count int := 0;
BEGIN
  WITH jobs AS (
    SELECT
      j.jobname,
      (regexp_match(j.command, $re$url\s*:?=\s*'([^']+)'$re$))[1] AS url
    FROM cron.job j
    WHERE j.jobname <> 'process-email-queue'
  ),
  responses AS (
    SELECT j.jobname, r.status_code, r.error_msg, r.created
    FROM net._http_response r
    JOIN net.http_request_queue q ON q.id = r.id
    JOIN jobs j ON j.url = q.url
    WHERE r.created > now() - make_interval(hours => GREATEST(p_hours, 1))
  ),
  per_job AS (
    SELECT
      jobname AS job_name,
      count(*) FILTER (WHERE status_code IN (401, 403))::int AS auth_failures,
      count(*)::int AS total_runs,
      max(created) AS last_run_at,
      (
        SELECT left(coalesce(r2.error_msg, 'HTTP ' || r2.status_code::text), 500)
        FROM responses r2
        WHERE r2.jobname = r.jobname
          AND (r2.status_code IS NULL OR r2.status_code >= 400)
        ORDER BY r2.created DESC LIMIT 1
      ) AS sample_message
    FROM responses r
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
$fn$;