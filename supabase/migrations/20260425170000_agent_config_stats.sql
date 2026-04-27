-- Add per-agent summary statistics to agent_config so the monitoring
-- dashboard can read a single lightweight table instead of pulling 2000
-- research_task rows on every poll.
--
-- Fields updated at the end of every agent run (via finish_agent_run RPC).

ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS last_run_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_status    TEXT,
  ADD COLUMN IF NOT EXISTS success_count      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_duration_ms   INT;

COMMENT ON COLUMN public.agent_config.last_run_at      IS 'Timestamp of the most recent completed run';
COMMENT ON COLUMN public.agent_config.last_run_status  IS 'Status of the most recent run (completed | failed)';
COMMENT ON COLUMN public.agent_config.success_count    IS 'Cumulative completed run count';
COMMENT ON COLUMN public.agent_config.failure_count    IS 'Cumulative failed run count';
COMMENT ON COLUMN public.agent_config.last_duration_ms IS 'Duration of the most recent run in milliseconds';

-- finish_agent_run: called by agents after a run completes or fails.
-- Atomically updates the stats columns and returns nothing.

CREATE OR REPLACE FUNCTION public.finish_agent_run(
  p_agent_type   TEXT,
  p_status       TEXT,       -- 'completed' | 'failed'
  p_duration_ms  INT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.agent_config (agent_type, enabled, last_run_at, last_run_status, last_duration_ms,
    success_count, failure_count)
  VALUES (
    p_agent_type, true, now(), p_status, p_duration_ms,
    CASE WHEN p_status = 'completed' THEN 1 ELSE 0 END,
    CASE WHEN p_status = 'failed'    THEN 1 ELSE 0 END
  )
  ON CONFLICT (agent_type) DO UPDATE SET
    last_run_at      = now(),
    last_run_status  = p_status,
    last_duration_ms = COALESCE(p_duration_ms, agent_config.last_duration_ms),
    success_count    = agent_config.success_count + CASE WHEN p_status = 'completed' THEN 1 ELSE 0 END,
    failure_count    = agent_config.failure_count + CASE WHEN p_status = 'failed'    THEN 1 ELSE 0 END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finish_agent_run(TEXT, TEXT, INT) TO authenticated, service_role;
