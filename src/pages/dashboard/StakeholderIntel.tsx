import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users2, Search, ChevronDown, ChevronRight, Building2 } from 'lucide-react';

function formatValue(v: number | null) {
  if (!v) return '-';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

interface OrgGroup {
  name: string;
  projectCount: number;
  totalValue: number;
  sectors: string[];
  regions: string[];
  roles: string[];
  projects: { id: string; name: string; sector: string; region: string; value_usd: number | null; stage: string }[];
}

export default function StakeholderIntel() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Top orgs on initial load
  const { data: topOrgs = [], isLoading: topLoading } = useQuery({
    queryKey: ['top-stakeholder-orgs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_contacts')
        .select('organization, project_id, projects(id, name, sector, region, value_usd, stage)')
        .not('organization', 'is', null)
        .limit(300);
      return data ?? [];
    },
  });

  // Search results
  const { data: contactResults = [], isFetching: contactFetching } = useQuery({
    queryKey: ['stakeholder-contacts', submitted],
    queryFn: async () => {
      if (!submitted) return [];
      const { data } = await supabase
        .from('project_contacts')
        .select('id, name, organization, role, project_id, projects(id, name, sector, region, value_usd, stage)')
        .ilike('organization', `%${submitted}%`)
        .limit(200);
      return data ?? [];
    },
    enabled: !!submitted,
  });

  const { data: stakeholderResults = [], isFetching: stakeholderFetching } = useQuery({
    queryKey: ['stakeholder-stakeholders', submitted],
    queryFn: async () => {
      if (!submitted) return [];
      const { data } = await supabase
        .from('project_stakeholders')
        .select('id, name, role, project_id, projects(id, name, sector, region, value_usd, stage)')
        .ilike('name', `%${submitted}%`)
        .limit(200);
      return data ?? [];
    },
    enabled: !!submitted,
  });

  // Group top orgs by organization name
  const topOrgGroups = useMemo((): OrgGroup[] => {
    const map = new Map<string, OrgGroup>();
    (topOrgs as any[]).forEach(c => {
      const org = c.organization;
      if (!org) return;
      const proj = c.projects;
      if (!map.has(org)) {
        map.set(org, { name: org, projectCount: 0, totalValue: 0, sectors: [], regions: [], roles: [], projects: [] });
      }
      const g = map.get(org)!;
      g.projectCount++;
      if (proj) {
        g.totalValue += proj.value_usd ?? 0;
        if (proj.sector && !g.sectors.includes(proj.sector)) g.sectors.push(proj.sector);
        if (proj.region && !g.regions.includes(proj.region)) g.regions.push(proj.region);
        g.projects.push({ id: proj.id, name: proj.name, sector: proj.sector, region: proj.region, value_usd: proj.value_usd, stage: proj.stage });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => b.projectCount - a.projectCount)
      .slice(0, 20);
  }, [topOrgs]);

  // Group search results by organization
  const searchGroups = useMemo((): OrgGroup[] => {
    if (!submitted) return [];
    const map = new Map<string, OrgGroup>();

    const addEntry = (orgName: string, role: string | null, proj: any) => {
      const key = orgName;
      if (!map.has(key)) map.set(key, { name: orgName, projectCount: 0, totalValue: 0, sectors: [], regions: [], roles: [], projects: [] });
      const g = map.get(key)!;
      g.projectCount++;
      if (role && !g.roles.includes(role)) g.roles.push(role);
      if (proj) {
        g.totalValue += proj.value_usd ?? 0;
        if (proj.sector && !g.sectors.includes(proj.sector)) g.sectors.push(proj.sector);
        if (proj.region && !g.regions.includes(proj.region)) g.regions.push(proj.region);
        const exists = g.projects.some(p => p.id === proj.id);
        if (!exists) g.projects.push({ id: proj.id, name: proj.name, sector: proj.sector, region: proj.region, value_usd: proj.value_usd, stage: proj.stage });
      }
    };

    (contactResults as any[]).forEach(c => {
      if (c.organization) addEntry(c.organization, c.role, c.projects);
    });
    (stakeholderResults as any[]).forEach(s => {
      if (s.name) addEntry(s.name, s.role, s.projects);
    });

    return Array.from(map.values()).sort((a, b) => b.projectCount - a.projectCount);
  }, [contactResults, stakeholderResults, submitted]);

  const isFetching = contactFetching || stakeholderFetching;
  const displayGroups = submitted ? searchGroups : topOrgGroups;
  const isLoading = submitted ? isFetching : topLoading;

  const toggleExpand = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(query.trim());
    setExpanded(new Set());
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users2 className="h-5 w-5 text-primary" /> Stakeholder Intel
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Search organizations and contractors across all projects.</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search organization or contractor name..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>
        <button type="submit" className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">Search</button>
      </form>

      <div className="space-y-1">
        <div className="flex items-center gap-2 mb-3">
          {submitted ? (
            <>
              <span className="text-sm font-medium">Results for "{submitted}"</span>
              <span className="text-xs text-muted-foreground">({searchGroups.length} organizations)</span>
              <button onClick={() => { setSubmitted(''); setQuery(''); }} className="text-xs text-primary hover:underline ml-2">Clear</button>
            </>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">Top organizations by project involvement</span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : displayGroups.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No organizations found.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {displayGroups.map(org => {
              const isOpen = expanded.has(org.name);
              return (
                <div key={org.name} className="glass-panel rounded-xl overflow-hidden border border-border/30">
                  <button
                    onClick={() => toggleExpand(org.name)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/10 transition-colors"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{org.name}</p>
                      <div className="flex items-center gap-3 flex-wrap mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{org.projectCount} project{org.projectCount !== 1 ? 's' : ''}</span>
                        {org.totalValue > 0 && <span className="text-[10px] text-muted-foreground">{formatValue(org.totalValue)} pipeline</span>}
                        {org.sectors.slice(0, 2).map(s => <Badge key={s} variant="outline" className="text-[9px]">{s}</Badge>)}
                        {org.regions.slice(0, 2).map(r => <span key={r} className="text-[10px] text-muted-foreground">{r}</span>)}
                      </div>
                    </div>
                    {org.roles.length > 0 && (
                      <div className="hidden sm:flex gap-1 shrink-0">
                        {org.roles.slice(0, 2).map(r => <Badge key={r} variant="outline" className="text-[9px]">{r}</Badge>)}
                      </div>
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/20 px-4 py-3 space-y-1.5 bg-muted/5">
                      {org.projects.map(p => (
                        <div key={p.id} className="flex items-center gap-3 py-1">
                          <Link to={`/dashboard/projects/${p.id}`} className="text-xs text-primary hover:underline flex-1 min-w-0 truncate">{p.name}</Link>
                          <span className="text-[10px] text-muted-foreground shrink-0">{p.sector}</span>
                          {p.stage && <Badge variant="outline" className="text-[9px] shrink-0">{p.stage}</Badge>}
                          {p.value_usd && <span className="text-[10px] font-mono text-muted-foreground shrink-0">{formatValue(p.value_usd)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
