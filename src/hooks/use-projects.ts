import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Project, Region, Sector, ProjectStage, ProjectStatus, Evidence, Milestone, Contact } from '@/data/projects';

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
}

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
    detailedAnalysis: (p as any).detailed_analysis || '',
    keyRisks: (p as any).key_risks || '',
    fundingSources: (p as any).funding_sources || '',
    environmentalImpact: (p as any).environmental_impact || '',
    politicalContext: (p as any).political_context || '',
    sourceUrl: (p as any).source_url || '',
    dbId: p.id,
  };
}

export function useProjects(filters?: { regions?: string[]; sectors?: string[]; stages?: string[] }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProjects() {
      setLoading(true);
      const [{ data: pData }, { data: sData }, { data: mData }, { data: eData }, { data: cData }] = await Promise.all([
        supabase.from('projects').select('*').eq('approved', true).order('value_usd', { ascending: false }),
        supabase.from('project_stakeholders').select('*'),
        supabase.from('project_milestones').select('*'),
        supabase.from('evidence_sources').select('*'),
        supabase.from('project_contacts').select('*'),
      ]);

      if (!pData) { setLoading(false); return; }

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

      let result = pData.map((p: any) =>
        dbToProject(p, stakeholderMap[p.id] || [], milestoneMap[p.id] || [], evidenceMap[p.id] || [], contactMap[p.id] || [])
      );

      // Apply client-side filters from user preferences
      if (filters?.regions && filters.regions.length > 0) {
        result = result.filter(p => filters.regions!.includes(p.region));
      }
      if (filters?.sectors && filters.sectors.length > 0) {
        result = result.filter(p => filters.sectors!.includes(p.sector));
      }
      if (filters?.stages && filters.stages.length > 0) {
        result = result.filter(p => filters.stages!.includes(p.stage));
      }

      setProjects(result);
      setLoading(false);
    }

    fetchProjects();

    // Realtime subscription
    const channel = supabase
      .channel('projects-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchProjects();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { projects, loading };
}
