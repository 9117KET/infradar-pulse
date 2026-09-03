-- Harden billing-status tables so plan gates on contact PII cannot be manipulated client-side
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscriptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.lifetime_grants FROM anon, authenticated;
REVOKE ALL ON public.subscriptions FROM anon;
REVOKE ALL ON public.lifetime_grants FROM anon;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.lifetime_grants TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
GRANT ALL ON public.lifetime_grants TO service_role;

-- Allow anonymous marketing visitors to read published insights only
DROP POLICY IF EXISTS "Anyone can read published insights" ON public.insights;
CREATE POLICY "Anyone can read published insights"
ON public.insights
FOR SELECT
TO anon
USING (published = true);

GRANT SELECT ON public.insights TO anon;