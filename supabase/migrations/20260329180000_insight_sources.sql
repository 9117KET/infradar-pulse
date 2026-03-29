-- Verifiable references for insights (URLs + labels for HITL review)
ALTER TABLE public.insights
  ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.insights.sources IS 'Array of { "label": string, "url": string } for citation / verification.';
