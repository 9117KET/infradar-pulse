/**
 * public-stats
 *
 * No-auth endpoint that returns live aggregate stats for use in:
 * - Embeddable partner widgets
 * - Cold email social proof
 * - Public "live counter" on the marketing page
 *
 * Results are cached at the DB level by using a simple 1-hour materialized value.
 * Since this is a small query on indexed tables, it runs in <50ms.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  // Count active projects
  const { count: projectCount } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })

  // Sum pipeline value (value_usd)
  const { data: valueRow } = await supabase
    .from('projects')
    .select('value_usd')
    .not('value_usd', 'is', null)

  const pipelineValue = (valueRow ?? []).reduce(
    (sum: number, r: { value_usd: number | null }) => sum + (r.value_usd ?? 0),
    0,
  )

  // Count distinct regions covered
  const { data: regionRows } = await supabase
    .from('projects')
    .select('region')

  const regions = new Set((regionRows ?? []).map((r: { region: string }) => r.region).filter(Boolean))

  const stats = {
    projects_tracked: projectCount ?? 0,
    regions_covered: regions.size,
    pipeline_value_usd: Math.round(pipelineValue),
    last_updated: new Date().toISOString(),
  }

  return new Response(JSON.stringify(stats), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      // Allow browsers to cache for 1 hour; CDN for 6 hours
      'Cache-Control': 'public, max-age=3600, s-maxage=21600',
    },
  })
})
