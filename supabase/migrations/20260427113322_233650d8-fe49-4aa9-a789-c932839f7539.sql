ALTER TABLE public.insights
ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_insights_sources_gin
ON public.insights USING gin (sources);