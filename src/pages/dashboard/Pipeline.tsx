import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { useTrackedProjects } from '@/hooks/use-tracked-projects';
import { STAGES } from '@/data/projects';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2, Cpu, Droplets, Factory, Fuel, Hexagon, Home, Landmark,
  Mountain, Server, Sun, Train, Wifi, Zap,
} from 'lucide-react';

const STAGE_COLORS: Record<string, string> = {
  Planned: 'border-slate-500/40 bg-slate-500/5',
  Tender: 'border-violet-500/40 bg-violet-500/5',
  Awarded: 'border-blue-500/40 bg-blue-500/5',
  Financing: 'border-amber-500/40 bg-amber-500/5',
  Construction: 'border-emerald-500/40 bg-emerald-500/5',
  Completed: 'border-teal-500/40 bg-teal-500/5',
  Cancelled: 'border-red-500/40 bg-red-500/5',
  Stopped: 'border-red-700/40 bg-red-700/5',
};

const STAGE_HEADER: Record<string, string> = {
  Planned: 'text-slate-400',
  Tender: 'text-violet-400',
  Awarded: 'text-blue-400',
  Financing: 'text-amber-400',
  Construction: 'text-emerald-400',
  Completed: 'text-teal-400',
  Cancelled: 'text-red-400',
  Stopped: 'text-red-500',
};

const SECTOR_ICONS: Record<string, LucideIcon> = {
  'AI Infrastructure': Cpu, 'Building Construction': Home, 'Chemical': Hexagon,
  'Data Centers': Server, 'Digital Infrastructure': Wifi, 'Energy': Zap,
  'Industrial': Factory, 'Infrastructure': Landmark, 'Mining': Mountain,
  'Oil & Gas': Fuel, 'Renewable Energy': Sun, 'Transport': Train,
  'Urban Development': Building2, 'Water': Droplets,
};

function formatValue(v: number) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return v > 0 ? `$${v.toLocaleString()}` : '';
}

export default function Pipeline() {
  const { allProjects, loading } = useProjects();
  const { trackedProjects, isLoading: trackedLoading } = useTrackedProjects();
  const [scope, setScope] = useState<'portfolio' | 'all'>('all');

  const source = useMemo(() => {
    const trackedIds = new Set(trackedProjects.map(t => t.project_id));
    return scope === 'portfolio'
      ? allProjects.filter(p => p.dbId && trackedIds.has(p.dbId))
      : allProjects;
  }, [allProjects, trackedProjects, scope]);

  const columns = useMemo(() =>
    STAGES.map(stage => {
      const projects = source.filter(p => p.stage === stage).sort((a, b) => (b.value || 0) - (a.value || 0));
      const total = projects.reduce((s, p) => s + (p.value || 0), 0);
      return { stage, projects, total };
    }),
    [source]
  );

  const isLoading = loading || trackedLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pipeline View</h1>
          <p className="text-sm text-muted-foreground mt-1">Projects grouped by stage. Sorted by value within each column.</p>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(['all', 'portfolio'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1.5 capitalize transition-colors ${scope === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {s === 'all' ? 'All projects' : 'My portfolio'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAGES.map(s => <Skeleton key={s} className="h-64 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-start">
          {columns.map(({ stage, projects, total }) => {
            const headerCls = STAGE_HEADER[stage];
            return (
              <div key={stage} className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className={`text-xs font-bold uppercase tracking-wide ${headerCls}`}>{stage}</span>
                  <Badge variant="outline" className="text-[10px]">{projects.length}</Badge>
                </div>
                {total > 0 && <p className="text-[10px] text-muted-foreground px-1 -mt-1">{formatValue(total)}</p>}
                <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-0.5">
                  {projects.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/30 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">None</p>
                    </div>
                  ) : projects.map(p => {
                    const Icon = SECTOR_ICONS[p.sector] || Building2;
                    return (
                      <Link
                        key={p.id}
                        to={`/dashboard/projects/${p.id}`}
                        className={`block rounded-lg border p-2.5 transition-colors hover:brightness-110 ${STAGE_COLORS[stage]}`}
                      >
                        <div className="flex items-start gap-1.5 mb-1.5">
                          <Icon className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-[11px] font-medium leading-snug line-clamp-2">{p.name}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-1.5">{p.country}</p>
                        <div className="flex items-center justify-between">
                          {formatValue(p.value || 0) && (
                            <span className="text-[9px] font-mono text-muted-foreground">{formatValue(p.value || 0)}</span>
                          )}
                          <span className={`text-[9px] font-bold ml-auto ${p.riskScore >= 70 ? 'text-red-400' : p.riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {p.riskScore}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
