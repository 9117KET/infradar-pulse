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
 * Fetches minimal project location data for the public landing page globe/map.
 * No auth required — the projects table has a public SELECT policy.
 * Only fetches approved projects that have coordinates.
 */
export function usePublicProjectLocations() {
  const [locations, setLocations] = useState<PublicProjectLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      setLoading(true);
      // Supabase caps queries at 1000 rows by default. Page through results so
      // the home-page counters reflect the true total of approved projects.
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

      if (!cancelled) {
        setLocations(all);
        setLoading(false);
      }
    }

    void fetch();
    return () => { cancelled = true; };
  }, []);

  return { locations, loading };
}
