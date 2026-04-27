-- Register the demo follow-up scheduler agent so it can be paused/resumed
-- from the AgentMonitoring dashboard.

INSERT INTO public.agent_config (agent_type)
VALUES ('demo_followup')
ON CONFLICT (agent_type) DO NOTHING;
