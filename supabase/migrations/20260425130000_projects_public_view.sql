-- Projects public view - defense-in-depth column restriction for anonymous access
-- Problem: The projects table RLS policy USING (true) allows the anon role to
-- read ALL columns via the REST API, including sensitive paid-plan fields:
--   detailed_analysis, key_risks, funding_sources, political_context, environmental_impact
-- The public Insights marketing page only needs aggregate stats from safe columns.
--
-- Fix: Create a restricted view that exposes only non-sensitive columns.
-- The frontend hook (use-public-project-stats.ts) already selects only safe
-- columns explicitly. This view is a second layer of protection so even a
-- direct REST call to /rest/v1/projects_public cannot leak sensitive fields.

CREATE OR REPLACE VIEW public.projects_public AS
SELECT
  id,
  name,
  country,
  region,
  sector,
  stage,
  status,
  value_usd,
  value_label,
  confidence,
  risk_score,
  last_updated,
  created_at,
  approved
FROM public.projects
WHERE approved = true;

-- Grant anonymous read on the restricted view only.
GRANT SELECT ON public.projects_public TO anon;
GRANT SELECT ON public.projects_public TO authenticated;

-- Note: The full projects table retains its existing RLS policies.
-- Authenticated dashboard users continue to hit the full table through
-- use-projects.ts (auth-gated pages). Anonymous visitors on the public
-- Insights page use use-public-project-stats.ts which selects only safe
-- columns from the full table. This view adds REST-API-level protection
-- on top of the client-side column selection.
