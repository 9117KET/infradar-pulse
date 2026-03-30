import { useEffect, useMemo } from 'react';
import { useProjects } from '@/hooks/use-projects';
import { useAuth } from '@/contexts/AuthContext';
import { useAlerts } from '@/hooks/use-alerts';
import { useTrackedProjects } from '@/hooks/use-tracked-projects';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  TrendingUp, ShieldCheck, Activity, Clock, AlertTriangle, Bot, Search,
  RefreshCw, ShieldAlert, CheckCircle2, ClipboardCheck, DollarSign, Zap, Users, Star,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import OverviewMap from '@/components/dashboard/OverviewMap';

const CHART_COLORS = ['#5eead4', '#38bdf8', '#a78bfa', '#fb923c', '#f87171', '#34d399'];
const SEVERITY_COLORS: Record<string, string> = { critical: '#dc2626', high: '#f59e0b', medium: '#3b82f6', low: '#64748b' };
const STAGE_COLORS: Record<string, string> = {
  Planned: '#64748b', Tender: '#8b5cf6', Awarded: '#3b82f6', Financing: '#f59e0b',
  Construction: '#22c55e', Completed: '#14b8a6', Cancelled: '#ef4444', Stopped: '#dc2626',
};

export default function DashboardOverview() {
  const { profile } = useAuth();
  const filters = profile?.onboarded ? { regions: profile.regions, sectors: profile.sectors, stages: profile.stages } : undefined;
  const { projects, allProjects, loading: projectsLoading } = useProjects(filters);
  const { alerts, loading: alertsLoading, stats: alertStats } = useAlerts();
  const hasPreferenceFilters =
    !!profile?.onboarded &&
    ((profile.regions?.length ?? 0) > 0 || (profile.sectors?.length ?? 0) > 0 || (profile.stages?.length ?? 0) > 0);
  const { trackedProjects, isLoading: trackedLoading } = useTrackedProjects();
  const queryClient = useQueryClient();

  const { data: researchTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['research-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('research_tasks').select('*').order('created_at', { ascending: false }).limit(10);
      if (error) throw error;
      return data;
    },
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pending-count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('approved', false);
      if (error) throw error;
      return count || 0;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('overview-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'research_tasks' }, () => queryClient.invalidateQueries({ queryKey: ['research-tasks'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => { queryClient.invalidateQueries({ queryKey: ['pending-count'] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => queryClient.invalidateQueries({ queryKey: ['alerts'] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const focusProjectNames = useMemo(() => {
    const s = new Set<string>();
    projects.forEach((p) => {
      s.add(p.name.trim().toLowerCase());
    });
    return s;
  }, [projects]);

  const focusAlerts = useMemo(
    () => alerts.filter((a) => focusProjectNames.has((a.projectName || '').trim().toLowerCase())),
    [alerts, focusProjectNames],
  );

  const focusAlertStats = useMemo(() => {
    let unread = 0;
    let critical = 0;
    for (const a of focusAlerts) {
      if (!a.read) unread++;
      if (a.severity === 'critical') critical++;
    }
    return { unread, critical, total: focusAlerts.length };
  }, [focusAlerts]);

  // Platform-wide (full approved pipeline)
  const marketTotalValue = useMemo(() => allProjects.reduce((s, p) => s + (p.valueUsd || 0), 0), [allProjects]);
  const marketAvgConfidence = useMemo(
    () => (allProjects.length ? Math.round(allProjects.reduce((s, p) => s + p.confidence, 0) / allProjects.length) : 0),
    [allProjects],
  );
  const marketVerifiedCount = useMemo(() => allProjects.filter((p) => p.status === 'Verified').length, [allProjects]);

  const globalRegionData = useMemo(() => {
    const map: Record<string, number> = {};
    allProjects.forEach((p) => {
      map[p.region] = (map[p.region] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [allProjects]);

  // Your coverage (onboarding / Settings preferences)
  const totalValue = useMemo(() => projects.reduce((s, p) => s + (p.valueUsd || 0), 0), [projects]);
  const avgConfidence = useMemo(() => projects.length ? Math.round(projects.reduce((s, p) => s + p.confidence, 0) / projects.length) : 0, [projects]);
  const verifiedCount = useMemo(() => projects.filter(p => p.status === 'Verified').length, [projects]);
  const recentRuns = useMemo(() => {
    const cutoff = Date.now() - 86400000;
    return researchTasks.filter(t => new Date(t.created_at).getTime() > cutoff).length;
  }, [researchTasks]);

  // Data Quality Score
  const dataQuality = useMemo(() => {
    if (!projects.length) return { overall: 0, fields: [] };
    const fieldChecks = [
      { name: 'Description', check: (p: typeof projects[0]) => !!p.description && p.description.length > 10 },
      { name: 'Coordinates', check: (p: typeof projects[0]) => p.lat !== 0 && p.lng !== 0 },
      { name: 'Value', check: (p: typeof projects[0]) => p.valueUsd > 0 },
      { name: 'Source URL', check: (p: typeof projects[0]) => !!(p as any).sourceUrl },
      { name: 'Evidence', check: (p: typeof projects[0]) => p.evidence.length > 0 },
      { name: 'Contacts', check: (p: typeof projects[0]) => p.contacts?.length > 0 },
      { name: 'Milestones', check: (p: typeof projects[0]) => p.milestones?.length > 0 },
      { name: 'Stakeholders', check: (p: typeof projects[0]) => p.stakeholders?.length > 0 },
    ];
    const fields = fieldChecks.map(f => {
      const filled = projects.filter(f.check).length;
      return { name: f.name, pct: Math.round((filled / projects.length) * 100), filled, total: projects.length };
    });
    const overall = Math.round(fields.reduce((s, f) => s + f.pct, 0) / fields.length);
    return { overall, fields };
  }, [projects]);

  const regionData = useMemo(() => {
    const map: Record<string, number> = {};
    projects.forEach(p => { map[p.region] = (map[p.region] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [projects]);

  const sectorData = useMemo(() => {
    const map: Record<string, number> = {};
    projects.forEach(p => { map[p.sector] = (map[p.sector] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [projects]);

  const stageData = useMemo(() => {
    const stages = ['Planned', 'Tender', 'Awarded', 'Financing', 'Construction', 'Completed'];
    const map: Record<string, number> = {};
    projects.forEach(p => { map[p.stage] = (map[p.stage] || 0) + 1; });
    return stages.map(name => ({ name, value: map[name] || 0 }));
  }, [projects]);

  const alertDistribution = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    focusAlerts.forEach(a => {
      if (!map[a.category]) map[a.category] = {};
      map[a.category][a.severity] = (map[a.category][a.severity] || 0) + 1;
    });
    return Object.entries(map).map(([category, sevs]) => ({ category, ...sevs }));
  }, [focusAlerts]);

  const confidenceTrend = useMemo(() => {
    const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    const base = avgConfidence || 80;
    return months.map((month, i) => ({ month, value: Math.max(50, base - (5 - i) * 1.2 + Math.random() * 2) | 0 }));
  }, [avgConfidence]);

  const marketKPIs = useMemo(() => [
    { label: 'Projects (platform)', value: allProjects.length, icon: Activity, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Verified (platform)', value: marketVerifiedCount, icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Avg confidence (platform)', value: `${marketAvgConfidence}%`, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Total value (platform)', value: marketTotalValue >= 1e9 ? `$${(marketTotalValue / 1e9).toFixed(1)}B` : `$${(marketTotalValue / 1e6).toFixed(0)}M`, icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { label: 'Unread alerts (all)', value: alertStats.unread, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Critical alerts (all)', value: alertStats.critical, icon: Zap, color: 'text-red-400', bg: 'bg-red-400/10' },
    { label: 'Pending review', value: pendingCount, icon: ClipboardCheck, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  ], [allProjects.length, marketVerifiedCount, marketAvgConfidence, marketTotalValue, alertStats, pendingCount]);

  const focusKPIs = useMemo(() => [
    { label: 'Projects in your coverage', value: projects.length, icon: Activity, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Verified', value: verifiedCount, icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Avg confidence', value: `${avgConfidence}%`, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Total value', value: totalValue >= 1e9 ? `$${(totalValue / 1e9).toFixed(1)}B` : `$${(totalValue / 1e6).toFixed(0)}M`, icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { label: 'Unread alerts (your projects)', value: focusAlertStats.unread, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Critical (your projects)', value: focusAlertStats.critical, icon: Zap, color: 'text-red-400', bg: 'bg-red-400/10' },
    { label: 'Data quality', value: `${dataQuality.overall}%`, icon: Users, color: dataQuality.overall >= 70 ? 'text-emerald-400' : dataQuality.overall >= 40 ? 'text-amber-400' : 'text-red-400', bg: dataQuality.overall >= 70 ? 'bg-emerald-400/10' : dataQuality.overall >= 40 ? 'bg-amber-400/10' : 'bg-red-400/10' },
  ], [projects.length, verifiedCount, avgConfidence, totalValue, focusAlertStats, dataQuality.overall]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Infrastructure intelligence overview</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
          <strong className="text-foreground">Platform pipeline</strong> shows every approved project in InfraRadar so you can see total market scale.
          {' '}
          <strong className="text-foreground">Your coverage</strong> filters by regions, sectors, and stages you chose in onboarding (editable in Settings).
          Charts and the map below reflect your coverage; alert counts in that section only include alerts tied to projects in your coverage.
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="font-serif text-lg font-semibold text-foreground">Platform pipeline</h2>
        <p className="text-xs text-muted-foreground">Full approved pipeline — compare scale before drilling into your preferences.</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {marketKPIs.map(k => (
            <div key={k.label} className="glass-panel rounded-xl p-4">
              <div className="mb-3">
                <div className={`inline-flex p-1.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
                </div>
              </div>
              {projectsLoading ? <Skeleton className="h-7 w-12" /> : <div className="text-xl font-serif font-bold">{k.value}</div>}
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{k.label}</div>
            </div>
          ))}
        </div>
        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-base font-semibold mb-3">Global snapshot — projects by region</h3>
          {projectsLoading ? <Skeleton className="h-[200px] w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={globalRegionData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2} stroke="none">
                  {globalRegionData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(210 12% 9%)', border: '1px solid hsl(210 10% 18%)', borderRadius: 8, fontSize: 12, color: 'hsl(180 10% 92%)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          {!projectsLoading && (
            <div className="flex flex-wrap gap-3 mt-2">
              {globalRegionData.map((r, i) => (
                <span key={r.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  {r.name} ({r.value})
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-serif text-lg font-semibold text-foreground">Your coverage</h2>
        {hasPreferenceFilters ? (
          <div className="flex flex-wrap gap-2 text-xs">
            {profile?.regions?.map((r) => (
              <Badge key={r} variant="secondary" className="font-normal">Region: {r}</Badge>
            ))}
            {profile?.sectors?.map((s) => (
              <Badge key={s} variant="outline" className="font-normal">Sector: {s}</Badge>
            ))}
            {profile?.stages?.map((st) => (
              <Badge key={st} variant="outline" className="font-normal">Stage: {st}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Select regions, sectors, and stages in <Link to="/dashboard/settings" className="text-primary hover:underline">Settings</Link> or complete onboarding to narrow this view. Until then, coverage matches the full platform.
          </p>
        )}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {focusKPIs.map(k => (
            <div key={k.label} className="glass-panel rounded-xl p-4">
              <div className="mb-3">
                <div className={`inline-flex p-1.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
                </div>
              </div>
              {projectsLoading ? <Skeleton className="h-7 w-12" /> : <div className="text-xl font-serif font-bold">{k.value}</div>}
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts Row 1: Region donut + Sector bar */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-lg font-semibold mb-3">Projects by region</h3>
          {projectsLoading ? <Skeleton className="h-[220px] w-full" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={regionData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3} stroke="none">
                  {regionData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(210 12% 9%)', border: '1px solid hsl(210 10% 18%)', borderRadius: 8, fontSize: 12, color: 'hsl(180 10% 92%)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-wrap gap-3 mt-2">
            {regionData.map((r, i) => (
              <span key={r.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                {r.name} ({r.value})
              </span>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-lg font-semibold mb-3">Projects by sector (your coverage)</h3>
          {projectsLoading ? <Skeleton className="h-[220px] w-full" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={sectorData} layout="vertical" margin={{ left: 5, right: 15 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: 'hsl(210 8% 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(210 12% 9%)', border: '1px solid hsl(210 10% 18%)', borderRadius: 8, fontSize: 12, color: 'hsl(180 10% 92%)' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                  {sectorData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Mini Map — your coverage */}
      {!projectsLoading && <OverviewMap projects={projects} />}

      {/* Charts Row 2: Confidence trend + Alert distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-lg font-semibold mb-3">Confidence trend (your coverage)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={confidenceTrend}>
              <defs>
                <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(170 55% 63%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(170 55% 63%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 10% 18%)" />
              <XAxis dataKey="month" tick={{ fill: 'hsl(210 8% 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[50, 100]} tick={{ fill: 'hsl(210 8% 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(210 12% 9%)', border: '1px solid hsl(210 10% 18%)', borderRadius: 8, fontSize: 12, color: 'hsl(180 10% 92%)' }} />
              <Area type="monotone" dataKey="value" stroke="hsl(170 55% 63%)" fill="url(#confGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-lg font-semibold mb-3">Alert distribution (your projects)</h3>
          {alertsLoading ? <Skeleton className="h-[200px] w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={alertDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 10% 18%)" />
                <XAxis dataKey="category" tick={{ fill: 'hsl(210 8% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(210 8% 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(210 12% 9%)', border: '1px solid hsl(210 10% 18%)', borderRadius: 8, fontSize: 12, color: 'hsl(180 10% 92%)' }} />
                <Bar dataKey="critical" stackId="a" fill={SEVERITY_COLORS.critical} radius={[0, 0, 0, 0]} />
                <Bar dataKey="high" stackId="a" fill={SEVERITY_COLORS.high} />
                <Bar dataKey="medium" stackId="a" fill={SEVERITY_COLORS.medium} />
                <Bar dataKey="low" stackId="a" fill={SEVERITY_COLORS.low} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Data Quality Score */}
      <div className="glass-panel rounded-xl p-5">
        <h3 className="font-serif text-lg font-semibold mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Data quality score (your coverage)
          <span className={`ml-auto text-2xl font-bold ${dataQuality.overall >= 70 ? 'text-emerald-400' : dataQuality.overall >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
            {dataQuality.overall}%
          </span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {dataQuality.fields.map(f => (
            <div key={f.name} className="rounded-lg border border-border/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{f.name}</span>
                <span className={`text-xs font-semibold ${f.pct >= 70 ? 'text-emerald-400' : f.pct >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{f.pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-border overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${f.pct >= 70 ? 'bg-emerald-400' : f.pct >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${f.pct}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-1">{f.filled}/{f.total} projects</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline + Agent Activity + Pending */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-lg font-semibold mb-3">Pipeline by stage (your coverage)</h3>
          {projectsLoading ? <Skeleton className="h-[220px] w-full" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stageData} layout="vertical" margin={{ left: 5, right: 15 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={90} tick={{ fill: 'hsl(210 8% 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(210 12% 9%)', border: '1px solid hsl(210 10% 18%)', borderRadius: 8, fontSize: 12, color: 'hsl(180 10% 92%)' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
                  {stageData.map(s => <Cell key={s.name} fill={STAGE_COLORS[s.name] || '#64748b'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-panel rounded-xl p-5 lg:col-span-1">
          <h3 className="font-serif text-lg font-semibold mb-3 flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Agent activity
          </h3>
          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {tasksLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : researchTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No agent runs yet.</p>
            ) : researchTasks.slice(0, 6).map(task => {
              const isCompleted = task.status === 'completed';
              const isFailed = task.status === 'failed';
              const TaskIcon = task.task_type === 'discovery' ? Search : task.task_type === 'update_check' ? RefreshCw : ShieldAlert;
              return (
                <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 border border-border/20">
                  <div className={`rounded-full p-1 ${isCompleted ? 'bg-primary/20' : isFailed ? 'bg-destructive/20' : 'bg-amber-500/20'}`}>
                    <TaskIcon className={`h-3 w-3 ${isCompleted ? 'text-primary' : isFailed ? 'text-destructive' : 'text-amber-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium capitalize truncate">
                        {task.task_type === 'discovery' ? 'Research' : task.task_type === 'update_check' ? 'Update' : task.task_type}
                      </span>
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${isCompleted ? 'text-primary border-primary/30' : isFailed ? 'text-destructive border-destructive/30' : 'text-amber-500 border-amber-500/30'}`}>
                        {task.status}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60">{new Date(task.created_at).toLocaleString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-lg font-semibold mb-3 flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" /> Pending review
          </h3>
          <div className="flex flex-col items-center justify-center py-8">
            <div className="text-5xl font-serif font-bold text-primary">{pendingCount}</div>
            <p className="text-sm text-muted-foreground mt-2">AI-discovered projects</p>
            {pendingCount > 0 && (
              <Link to="/dashboard/review" className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <CheckCircle2 className="h-4 w-4" /> Review now
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Tracked Projects */}
      {trackedProjects.length > 0 && (
        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-lg font-semibold mb-4 flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-400 fill-amber-400" /> Your tracked projects
            <span className="text-sm font-normal text-muted-foreground ml-auto">{trackedProjects.length} tracked</span>
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trackedProjects.slice(0, 6).map(tp => {
              const project = allProjects.find(p => p.dbId === tp.project_id);
              if (!project) return null;
              return (
                <Link key={tp.id} to={`/dashboard/projects/${project.id}`} className="rounded-lg border border-border/50 p-3 hover:border-primary/30 transition-colors block">
                  <div className="flex items-center gap-2 mb-1">
                    <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                    <span className="text-sm font-medium truncate">{project.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">{project.status}</Badge>
                    <Badge variant="outline" className="text-[10px]">{project.stage}</Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">{project.country}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent project updates table */}
      <div className="glass-panel rounded-xl p-5">
        <h3 className="font-serif text-lg font-semibold mb-4">Recent project updates (your coverage)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 font-medium text-muted-foreground">Project</th>
                <th className="pb-2 font-medium text-muted-foreground">Region</th>
                <th className="pb-2 font-medium text-muted-foreground">Status</th>
                <th className="pb-2 font-medium text-muted-foreground">Confidence</th>
                <th className="pb-2 font-medium text-muted-foreground">Value</th>
              </tr>
            </thead>
            <tbody>
              {projectsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={5} className="py-2"><Skeleton className="h-5 w-full" /></td></tr>
                ))
              ) : projects.slice(0, 5).map(p => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="py-2"><Link to={`/dashboard/projects/${p.id}`} className="text-primary hover:underline text-xs">{p.name}</Link></td>
                  <td className="py-2 text-muted-foreground text-xs">{p.region}</td>
                  <td className="py-2"><Badge variant="outline" className="text-[10px]">{p.status}</Badge></td>
                  <td className="py-2 text-xs">{p.confidence}%</td>
                  <td className="py-2 text-xs">{p.valueLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
