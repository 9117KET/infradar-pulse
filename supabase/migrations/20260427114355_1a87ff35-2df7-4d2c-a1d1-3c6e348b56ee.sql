CREATE OR REPLACE FUNCTION public.get_agent_scheduler_activity()
RETURNS TABLE(
  task_type text,
  last_scheduler_run timestamp with time zone,
  scheduler_runs integer,
  scheduler_failures integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  WITH mapped_runs AS (
    SELECT
      CASE j.jobname
        WHEN 'research-agent' THEN 'discovery'
        WHEN 'update-checker' THEN 'update-check'
        WHEN 'risk-scorer' THEN 'risk-scoring'
        WHEN 'world-bank-ingest' THEN 'world-bank-ingest'
        WHEN 'ifc-ingest' THEN 'ifc-ingest'
        WHEN 'adb-ingest' THEN 'adb-ingest'
        WHEN 'afdb-ingest' THEN 'afdb-ingest'
        WHEN 'ebrd-ingest' THEN 'ebrd-ingest'
        WHEN 'dataset-refresh-agent' THEN 'dataset-refresh'
        WHEN 'dataset-refresh' THEN 'dataset-refresh'
        ELSE j.jobname
      END AS task_type,
      d.status,
      d.start_time
    FROM cron.job j
    JOIN cron.job_run_details d ON d.jobid = j.jobid
    WHERE j.jobname <> 'process-email-queue'
  )
  SELECT
    mr.task_type,
    max(mr.start_time) AS last_scheduler_run,
    count(*)::integer AS scheduler_runs,
    count(*) FILTER (WHERE mr.status <> 'succeeded')::integer AS scheduler_failures
  FROM mapped_runs mr
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'researcher'::public.app_role)
  GROUP BY mr.task_type
  ORDER BY mr.task_type;
$$;

REVOKE ALL ON FUNCTION public.get_agent_scheduler_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_agent_scheduler_activity() TO authenticated;