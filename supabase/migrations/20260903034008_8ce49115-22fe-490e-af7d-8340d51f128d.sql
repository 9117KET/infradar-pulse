UPDATE public.backfill_jobs
SET state = 'pending',
    consecutive_errors = 0,
    last_error = NULL,
    lease_until = NULL,
    updated_at = now()
WHERE source_key = 'adb-projects'
  AND agent_type = 'adb-ingest'
  AND state IN ('paused', 'failed');