import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Minimal project shape - only safe public columns, no sensitive analysis fields. */
interface PublicProjectRow {
  id: string;
  region: string;
  sector: string;
  value_usd: number;
  last_updated: string;
  status: string;
}

export interface PublicPipelineStats {
  count: number;
  totalUsd: number;
  regionCount: number;
  sectorCount: number;
  topRegions: [string, number][];
  updatedRecently: number;
  atRisk: number;
  verified: number;
}

const SAFE_COLUMNS = 'id,region,sector,value_usd,last_updated,status';
// Supabase default page size - match what usePublicProjectLocations uses.
const PAGE_SIZE = 1000;

/**
 * Fetches only the safe aggregate columns needed for the public Insights
 * marketing page pipeline snapshot. Explicitly excludes:
 *   - detailed_analysis, key_risks, funding_sources, political_context, environmental_impact
 *   - project_contacts, project_stakeholders, evidence_sources, project_milestones
 *
 * Paginates through all approved projects so the count is never silently
 * capped at Supabase's default 1000-row limit.
 *
 * This hook is safe to call for anonymous (unauthenticated) visitors.
 */
export function usePublicProjectStats(): { pipeline: PublicPipelineStats; loading: boolean } {
  const [rows, setRows] = useState<PublicProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchStats() {
    setLoading(true);
    const all: PublicProjectRow[] = [];
    let from = 0;
    // Hard upper bound prevents runaway loops (50k ≫ current scale).
    for (let i = 0; i < 50; i++) {
      const { data, error } = await supabase
        .from('projects')
        .select(SAFE_COLUMNS)
        .eq('approved', true)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...(data as PublicProjectRow[]));
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    setRows(all);
    setLoading(false);
  }

  useEffect(() => {
    void fetchStats();

    const channel = supabase
      .channel('public-project-stats-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => { void fetchStats(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const pipeline = useMemo<PublicPipelineStats>(() => {
    const count = rows.length;
    const totalUsd = rows.reduce((s, p) => s + (p.value_usd ?? 0), 0);
    const regionIds = new Set(rows.map((p) => p.region));
    const sectorIds = new Set(rows.map((p) => p.sector));
    const byRegion = rows.reduce<Record<string, number>>((acc, p) => {
      acc[p.region] = (acc[p.region] || 0) + 1;
      return acc;
    }, {});
    const topRegions = Object.entries(byRegion)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8) as [string, number][];
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const updatedRecently = rows.filter((p) => {
      const t = new Date(p.last_updated).getTime();
      return !Number.isNaN(t) && t >= thirtyDaysAgo;
    }).length;
    const atRisk = rows.filter((p) => p.status === 'At Risk').length;
    const verified = rows.filter((p) => p.status === 'Verified').length;
    return {
      count,
      totalUsd,
      regionCount: regionIds.size,
      sectorCount: sectorIds.size,
      topRegions,
      updatedRecently,
      atRisk,
      verified,
    };
  }, [rows]);

  return { pipeline, loading };
}
