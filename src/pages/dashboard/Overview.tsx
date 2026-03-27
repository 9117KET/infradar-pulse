import { useMemo } from 'react';
import { formatValue } from '@/data/projects';
import { useProjects } from '@/hooks/use-projects';
import { useAlerts } from '@/hooks/use-alerts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, ShieldCheck, Activity, Clock, AlertTriangle, Bot, Search, RefreshCw, ShieldAlert, CheckCircle2, XCircle, ClipboardCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

const CONFIDENCE_TREND = [
  { month: 'Oct', value: 79 },
  { month: 'Nov', value: 81 },
  { month: 'Dec', value: 83 },
  { month: 'Jan', value: 82 },
  { month: 'Feb', value: 85 },
  { month: 'Mar', value: 86 },
];

export default function DashboardOverview() {
  const { projects, loading: projectsLoading } = useProjects();
  const { alerts, loading: alertsLoading } = useAlerts();

  const KPIs = useMemo(() => [
    { label: 'Projects tracked', value: projects.length.toString(), delta: '+6% MoM', icon: Activity, trend: 'up' as const },
    { label: 'Analyst verified', value: projects.filter(p => p.status === 'Verified').length.toString(), delta: '+2 this week', icon: ShieldCheck, trend: 'up' as const },
    { label: 'Avg confidence', value: projects.length ? `${Math.round(projects.reduce((s, p) => s + p.confidence, 0) / projects.length)}%` : '—', delta: '+1.2%', icon: TrendingUp, trend: 'up' as const },
    { label: 'Freshness median', value: '3.2 days', delta: '-0.5d', icon: Clock, trend: 'up' as const },
  ], [projects]);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold">Infrastructure intelligence overview</h1>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIs.map(k => (
          <div key={k.label} className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">{k.label}</span>
              <k.icon className="h-4 w-4 text-primary" />
            </div>
            {projectsLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-serif font-bold">{k.value}</div>}
            <div className="text-xs text-emerald-500 mt-1">{k.delta}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Confidence trend */}
        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-lg font-semibold mb-4">Confidence trend (6 months)</h3>
          <div className="space-y-2">
            {CONFIDENCE_TREND.map(c => (
              <div key={c.month} className="flex items-center gap-3">
                <span className="w-8 text-xs text-muted-foreground">{c.month}</span>
                <div className="flex-1 h-5 rounded bg-black/20 overflow-hidden">
                  <div className="h-full rounded bg-primary/60" style={{ width: `${c.value}%` }} />
                </div>
                <span className="text-xs font-medium w-8 text-right">{c.value}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent alerts */}
        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-lg font-semibold mb-4">Recent alerts</h3>
          <div className="space-y-3">
            {alertsLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : alerts.slice(0, 4).map(a => (
              <div key={a.id} className="flex items-start gap-3 p-2 rounded-lg bg-white/[0.02]">
                <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-destructive' : a.severity === 'high' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{a.message}</p>
                  <p className="text-xs text-muted-foreground">{a.projectName} · {a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent project updates */}
      <div className="glass-panel rounded-xl p-5">
        <h3 className="font-serif text-lg font-semibold mb-4">Recent project updates</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 font-medium text-muted-foreground">Project</th>
                <th className="pb-2 font-medium text-muted-foreground">Region</th>
                <th className="pb-2 font-medium text-muted-foreground">Status</th>
                <th className="pb-2 font-medium text-muted-foreground">Confidence</th>
                <th className="pb-2 font-medium text-muted-foreground">Value</th>
                <th className="pb-2 font-medium text-muted-foreground">Updated</th>
              </tr>
            </thead>
            <tbody>
              {projectsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="py-2.5"><Skeleton className="h-6 w-full" /></td></tr>
                ))
              ) : projects.slice(0, 5).map(p => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="py-2.5"><Link to={`/dashboard/projects/${p.id}`} className="text-primary hover:underline">{p.name}</Link></td>
                  <td className="py-2.5 text-muted-foreground">{p.region}</td>
                  <td className="py-2.5"><Badge variant="outline" className="text-xs">{p.status}</Badge></td>
                  <td className="py-2.5">{p.confidence}%</td>
                  <td className="py-2.5">{p.valueLabel}</td>
                  <td className="py-2.5 text-muted-foreground">{p.lastUpdated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
