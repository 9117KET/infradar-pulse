-- Provenance for alerts: distinguish AI-monitor-generated intelligence from
-- system/human-verified alerts. Monitoring agents (regulatory, market-intel,
-- sentiment, funding, M&A, ESG, supply-chain, stakeholder, tender, security,
-- risk-scorer) now write origin = 'ai_agent'; everything else defaults to
-- 'system'.
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'system';

ALTER TABLE public.alerts
  DROP CONSTRAINT IF EXISTS alerts_origin_check;

ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_origin_check CHECK (origin IN ('system', 'ai_agent', 'human'));

COMMENT ON COLUMN public.alerts.origin IS
  'Provenance: system (pipeline/rule-based), ai_agent (LLM monitoring agent, unverified), human (staff-entered).';
