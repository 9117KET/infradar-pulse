import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PublicProjectLocation = {
  id: string;
  lat: number;
  lng: number;
  risk_score: number;
  sector: string;
  name: string;
  country: string;
  region: string | null;
  value_usd: number | null;
  stage: string | null;
};

/**
 * Fetches minimal project location data for the public landing page globe/map
 * and the Explore page. No auth required - the projects table has a public
 * SELECT policy.
 *
 * Only fetches approved projects that have coordinates. Paginates in 1,000-row
 * pages so the counters reflect the true total regardless of database size.
 *
 * Subscribes to Supabase realtime so the Explore page and every home page
 * component using this hook (HeroSection, ConversionBar, DemoSection,
 * SectorSnapshotSection, TrustStrip) stay live without a manual refresh.
 *
 * Safe columns only - no detailed_analysis, key_risks, funding_sources,
 * political_context, or environmental_impact.
 */
export function usePublicProjectLocations() {
  const [locations, setLocations] = useState<PublicProjectLocation[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchLocations() {
    // Supabase caps queries at 1000 rows by default. Page through results so
    // the counters reflect the true total of approved projects with coordinates.
    const PAGE_SIZE = 1000;
    const all: PublicProjectLocation[] = [];
    let from = 0;
    // Hard upper bound to avoid runaway loops (50k projects ≫ current scale).
    for (let i = 0; i < 50; i++) {
      const { data, error } = await supabase
        .from('projects')
        .select('id, lat, lng, risk_score, sector, name, country, region, value_usd, stage')
        .eq('approved', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...(data as PublicProjectLocation[]));
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    setLocations(all);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    void fetchLocations();

    // Realtime: re-fetch whenever any project row changes so counters and the
    // table/map stay current without a page refresh. This covers all 5 home
    // page components and the Explore page that share this hook.
    const channel = supabase
      .channel('public-project-locations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => { void fetchLocations(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return { locations, loading };
}
