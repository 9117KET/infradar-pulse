CREATE TABLE IF NOT EXISTS public.agent_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid,
  agent_type text NOT NULL,
  event_type text NOT NULL,
  message text NOT NULL DEFAULT '',
  counters jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agent_run_events TO authenticated;
GRANT ALL ON public.agent_run_events TO service_role;

ALTER TABLE public.agent_run_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read agent run events"
  ON public.agent_run_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher'));

CREATE INDEX IF NOT EXISTS idx_agent_run_events_agent ON public.agent_run_events (agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_run_events_task ON public.agent_run_events (task_id);