-- Remove stale duplicate agent_config rows (legacy keys superseded by the canonical task_type)
DELETE FROM public.agent_config
WHERE agent_type IN (
  'risk-scorer',
  'update-checker',
  'research-agent',
  'insight-sources-agent',
  'world-bank-ingest-agent'
);

-- Recompute counts/last_run from research_tasks history
SELECT public.rebuild_agent_config_from_tasks();

-- Enable AIIB ingest (was disabled and had never run)
INSERT INTO public.agent_config (agent_type, enabled)
VALUES ('aiib-ingest', true)
ON CONFLICT (agent_type) DO UPDATE SET enabled = true, updated_at = now();