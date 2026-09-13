import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

const QUERY_KEY = ['public-project-locations'] as const;

/**
 * Fetches minimal project location data for the public landing page map and the
 * Explore page. No auth required - the projects table has a public SELECT policy.
 *
 * Backed by a single shared react-query cache entry, so the five landing page
 * components using this hook (HeroSection, ConversionBar, DemoSection,
 * SectorSnapshotSection, TrustStrip) share ONE network fetch and ONE realtime
 * channel instead of five of each. That was the dominant cost of the first page
 * load.
 *
 * Only fetches approved projects that have coordinates, paginated in 1,000-row
 * pages so counters reflect the true total regardless of database size.
 *
 * Safe columns only - no detailed_analysis, key_risks, funding_sources,
 * political_context, or environmental_impact.
 */
async function fetchLocations(): Promise<PublicProjectLocation[]> {
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
  return all;
}

// Module-level guard so only the first mounted consumer opens the realtime
// channel; the rest simply read the shared cache.
let subscribers = 0;
let channel: ReturnType<typeof supabase.channel> | null = null;

export function usePublicProjectLocations() {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchLocations,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1 && !channel) {
      channel = supabase
        .channel(`public-project-locations-realtime-${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'projects' },
          () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
        )
        .subscribe();
    }
    return () => {
      subscribers -= 1;
      if (subscribers <= 0 && channel) {
        const toRemove = channel;
        channel = null;
        subscribers = 0;
        void supabase.removeChannel(toRemove);
      }
    };
  }, [queryClient]);

  return { locations: data ?? [], loading: isPending };
}
