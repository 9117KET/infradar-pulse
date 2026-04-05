-- Agent configuration table for pause/resume control.
-- Staff can enable/disable any agent from the dashboard.
-- Edge functions check this table at startup to respect the pause state.

CREATE TABLE IF NOT EXISTS public.agent_config (
  agent_type  TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id)
);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.set_agent_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_config_updated_at ON public.agent_config;
CREATE TRIGGER trg_agent_config_updated_at
  BEFORE UPDATE ON public.agent_config
  FOR EACH ROW EXECUTE FUNCTION public.set_agent_config_updated_at();

-- RLS
ALTER TABLE public.agent_config ENABLE ROW LEVEL SECURITY;

-- Anyone (including edge functions with anon key) can read
CREATE POLICY "agent_config_read_all" ON public.agent_config
  FOR SELECT USING (true);

-- Only staff (admin/researcher) can modify
CREATE POLICY "agent_config_write_staff" ON public.agent_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'researcher')
    )
  );

-- Pre-populate all known agent types (all enabled by default)
INSERT INTO public.agent_config (agent_type) VALUES
  ('discovery'),
  ('world-bank-ingest'),
  ('adb-ingest'),
  ('ifc-ingest'),
  ('afdb-ingest'),
  ('ebrd-ingest'),
  ('update-check'),
  ('risk-scoring'),
  ('stakeholder-intel'),
  ('funding-tracker'),
  ('regulatory-monitor'),
  ('sentiment-analyzer'),
  ('supply-chain-monitor'),
  ('market-intel'),
  ('contact-finder'),
  ('alert-intelligence'),
  ('data-enrichment'),
  ('digest-agent'),
  ('dataset-refresh'),
  ('report-agent'),
  ('source-ingest'),
  ('entity-dedup'),
  ('corporate-ma-monitor'),
  ('esg-social-monitor'),
  ('security-resilience'),
  ('tender-award-monitor'),
  ('executive-briefing'),
  ('user-research'),
  ('insight-sources')
ON CONFLICT (agent_type) DO NOTHING;
