import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Project, Region, Sector, ProjectStage, ProjectStatus, Evidence, Milestone, Contact } from '@/data/projects';
import { useEntitlements } from '@/hooks/useEntitlements';
import { getReadRowCap } from '@/lib/billing/readCaps';

export interface DbProject {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: string;
  sector: string;
  stage: string;
  status: string;
  value_usd: number;
  value_label: string;
  confidence: number;
  risk_score: number;
  lat: number;
  lng: number;
  description: string;
  timeline: string | null;
  last_updated: string;
  created_at: string;
  ai_generated: boolean;
  approved: boolean;
  created_by?: string | null;
  research_saved_by?: string | null;
}

export type ProjectFilters = { regions?: string[]; sectors?: string[]; stages?: string[] };

function dbToProject(
  p: DbProject & { detailed_analysis?: string; key_risks?: string; funding_sources?: string; environmental_impact?: string; political_context?: string; source_url?: string },
  stakeholders: string[],
  milestones: Milestone[],
  evidence: Evidence[],
  contacts: Contact[]
): Project {
  return {
    id: p.slug,
    name: p.name,
    country: p.country,
    region: p.region as Region,
    sector: p.sector as Sector,
    stage: p.stage as ProjectStage,
    status: p.status as ProjectStatus,
    valueUsd: p.value_usd,
    valueLabel: p.value_label,
    confidence: p.confidence,
    riskScore: p.risk_score,
    lat: p.lat,
    lng: p.lng,
    description: p.description,
    timeline: p.timeline || '',
    lastUpdated: p.last_updated?.split('T')[0] || '',
    stakeholders,
    milestones,
    evidence,
    contacts,
    detailedAnalysis: p.detailed_analysis || '',
    keyRisks: p.key_risks || '',
    fundingSources: p.funding_sources || '',
    environmentalImpact: p.environmental_impact || '',
    politicalContext: p.political_context || '',
    sourceUrl: p.source_url || '',
    dbId: p.id,
    createdByUserId: p.created_by ?? null,
    researchSavedByUserId: p.research_saved_by ?? null,
  };
}

/** Client-side filter from onboarding / Settings preferences. Empty array for a dimension = no filter on that dimension. */
export function applyProjectFilters(all: Project[], filters?: ProjectFilters): Project[] {
  if (!filters) return all;
  let result = all;
  if (filters.regions && filters.regions.length > 0) {
    result = result.filter((p) => filters.regions!.includes(p.region));
  }
  if (filters.sectors && filters.sectors.length > 0) {
    result = result.filter((p) => filters.sectors!.includes(p.sector));
  }
  if (filters.stages && filters.stages.length > 0) {
    result = result.filter((p) => filters.stages!.includes(p.stage));
  }
  return result;
}

export function useProjects(filters?: ProjectFilters) {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const { plan, staffBypass, isAnonymous, loading: entLoading } = useEntitlements();
  // Public marketing pages (anonymous visitors) skip caps; the dashboard is auth-gated.
  const rowCap = isAnonymous ? 0 : getReadRowCap(plan, staffBypass);

  const regionsKey = filters?.regions?.slice().sort().join('\0') ?? '';
  const sectorsKey = filters?.sectors?.slice().sort().join('\0') ?? '';
  const stagesKey = filters?.stages?.slice().sort().join('\0') ?? '';

  const projects = useMemo(
    () => applyProjectFilters(allProjects, filters),
    // Stable keys avoid stale closure when profile loads after mount; object identity alone is not stable.
    [allProjects, regionsKey, sectorsKey, stagesKey]
  );

  /** True when the user's plan capped how many rows they could fetch. */
  const truncated = rowCap > 0 && totalAvailable > rowCap;

  useEffect(() => {
    // Wait for entitlements so we don't fetch the full table for a free user.
    if (entLoading) return;
    async function fetchProjects() {
      setLoading(true);
      // First, get the true row count so we can show "X of Y" copy.
      const { count } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('approved', true);
      setTotalAvailable(count ?? 0);

      // Fetch projects: capped plans use a single limited query; unlimited plans
      // page through Supabase's default 1000-row ceiling with .range() so staff
      // and enterprise users see the full dataset.
      const SUPABASE_PAGE = 1000;
      let pData: any[] = [];
      if (rowCap > 0) {
        const { data } = await supabase
          .from('projects')
          .select('*')
          .eq('approved', true)
          .order('value_usd', { ascending: false })
          .limit(rowCap);
        pData = data ?? [];
      } else {
        let from = 0;
        for (let i = 0; i < 50; i++) {
          const { data } = await supabase
            .from('projects')
            .select('*')
            .eq('approved', true)
            .order('value_usd', { ascending: false })
            .range(from, from + SUPABASE_PAGE - 1);
          if (!data?.length) break;
          pData.push(...data);
          if (data.length < SUPABASE_PAGE) break;
          from += SUPABASE_PAGE;
        }
      }

      const [{ data: sData }, { data: mData }, { data: eData }, { data: cData }] = await Promise.all([
        supabase.from('project_stakeholders').select('*'),
        supabase.from('project_milestones').select('*'),
        supabase.from('evidence_sources').select('*'),
        supabase.from('project_contacts').select('*'),
      ]);

      if (!pData.length && rowCap > 0) {
        // No data returned for a capped user - nothing to show
        setLoading(false);
        return;
      }

      const stakeholderMap: Record<string, string[]> = {};
      (sData || []).forEach((s: any) => {
        if (!stakeholderMap[s.project_id]) stakeholderMap[s.project_id] = [];
        stakeholderMap[s.project_id].push(s.name);
      });

      const milestoneMap: Record<string, Milestone[]> = {};
      (mData || []).forEach((m: any) => {
        if (!milestoneMap[m.project_id]) milestoneMap[m.project_id] = [];
        milestoneMap[m.project_id].push({ id: m.id, title: m.title, date: m.date, completed: m.completed });
      });

      const evidenceMap: Record<string, Evidence[]> = {};
      (eData || []).forEach((e: any) => {
        if (!evidenceMap[e.project_id]) evidenceMap[e.project_id] = [];
        evidenceMap[e.project_id].push({ id: e.id, source: e.source, url: e.url, type: e.type, verified: e.verified, date: e.date, title: e.title || '', description: e.description || '', added_by: e.added_by || 'ai' });
      });

      const contactMap: Record<string, Contact[]> = {};
      (cData || []).forEach((c: any) => {
        if (!contactMap[c.project_id]) contactMap[c.project_id] = [];
        contactMap[c.project_id].push({ ...c, contact_type: c.contact_type || 'general' });
      });

      const result = pData.map((p: any) =>
        dbToProject(p, stakeholderMap[p.id] || [], milestoneMap[p.id] || [], evidenceMap[p.id] || [], contactMap[p.id] || [])
      );

      setAllProjects(result);
      setLoading(false);
    }

    fetchProjects();

    const channel = supabase
      .channel('projects-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchProjects();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [entLoading, rowCap]);

  return { projects, allProjects, loading, truncated, totalAvailable, rowCap };
}
