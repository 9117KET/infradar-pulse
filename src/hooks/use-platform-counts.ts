import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PlatformCounts {
  projects: number;
  countries: number;
  companies: number;
  contacts: number;
  projects_with_contacts: number;
}

/**
 * Live platform-wide counters (approved projects, cleaned country list,
 * canonical companies and contacts) from the public counts RPC.
 */
export function usePlatformCounts() {
  const [counts, setCounts] = useState<PlatformCounts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.rpc('get_public_platform_counts');
      if (!active) return;
      if (!error && data && typeof data === 'object') {
        setCounts(data as unknown as PlatformCounts);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return { counts, loading };
}
