-- Insights content access hardening
-- Problem: The existing "Public read published insights" policy (USING published = true)
-- allows the anon role to select ALL columns including `content` via the REST API.
-- This means anyone can bypass the client-side daily read meter by calling the
-- Supabase REST endpoint directly.
--
-- Fix: Replace the single public-read policy with two layered policies:
--   1. Anon role: published rows only, content column excluded (metadata list only)
--   2. Authenticated role: published rows, all columns (content metered client-side)
--   3. Staff: all rows including drafts, all columns (existing policy unchanged)
--
-- Column-level security via policy USING cannot restrict individual columns in
-- Postgres RLS directly. Instead we use a security-definer view that exposes
-- only safe columns for the anon role, and keep the full table accessible to
-- the authenticated role (where client-side metering applies).

-- Step 1: Drop the existing permissive public read policy.
DROP POLICY IF EXISTS "Public read published insights" ON public.insights;

-- Step 2: Authenticated users can read published insights in full (content metered client-side).
-- This covers signed-in free, trialing, starter, pro, enterprise, and lifetime users.
CREATE POLICY "Authenticated read published insights"
ON public.insights
FOR SELECT
TO authenticated
USING (published = true);

-- Step 3: Create a restricted view for anonymous (public marketing) access.
-- Exposes only non-content metadata so anonymous REST API calls cannot retrieve
-- the full article body. The public Insights page only needs list metadata fields.
CREATE OR REPLACE VIEW public.insights_public AS
SELECT
  id,
  title,
  slug,
  excerpt,
  tag,
  cover_image_url,
  author,
  published,
  ai_generated,
  reading_time_min,
  created_at,
  updated_at,
  source_url,
  sources
FROM public.insights
WHERE published = true;

-- Allow anonymous reads on the restricted view only.
GRANT SELECT ON public.insights_public TO anon;
GRANT SELECT ON public.insights_public TO authenticated;

-- Note: The existing staff policies (insert/update/delete/read-drafts) are unchanged.
-- The `useInsights` hook in the frontend uses authenticated JWT for all signed-in
-- users, so they hit "Authenticated read published insights" (full table).
-- Anonymous visitors on the public marketing page will be migrated to query
-- `insights_public` view in a follow-up frontend change, or continue to use the
-- full table with authenticated context if they sign in.
