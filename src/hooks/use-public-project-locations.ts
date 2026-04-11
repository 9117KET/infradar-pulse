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
      const { data } = await supabase
        .from('projects')
        .select('id, lat, lng, risk_score, sector, name, country')
        .eq('approved', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null);

      if (!cancelled) {
        setLocations((data as PublicProjectLocation[]) ?? []);
        setLoading(false);
      }
    }

    void fetch();
    return () => { cancelled = true; };
  }, []);

  return { locations, loading };
}
