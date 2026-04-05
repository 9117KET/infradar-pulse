import { useEffect, useMemo } from 'react';
import { useProjects } from '@/hooks/use-projects';
import { useAlerts } from '@/hooks/use-alerts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Activity, RefreshCw, Clock, ArrowRight, Bot, ShieldCheck, AlertTriangle,
  Zap, TrendingUp, Users, Search, ShieldAlert, CheckCircle2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line,
} from 'recharts';

interface ProjectUpdate {
  id: string;
  project_id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  source: string | null;
  created_at: string;
}

const CHART_COLORS = ['#5eead4', '#38bdf8', '#a78bfa', '#fb923c', '#f87171', '#34d399'];
const SEVERITY_COLORS: Record<string, string> = { critical: '#dc2626', high: '#f59e0b', medium: '#3b82f6', low: '#64748b' };
const TOOLTIP_STYLE = { background: 'hsl(210 12% 9%)', border: '1px solid hsl(210 10% 18%)', borderRadius: 8, fontSize: 12, color: 'hsl(180 10% 92%)' };
const TOOLTIP_LABEL_STYLE = { color: 'hsl(180 10% 92%)' };
const TOOLTIP_ITEM_STYLE = { color: 'hsl(180 10% 92%)' };

export default function RealTimeMonitoring() {
  const { projects, loading } = useProjects();
  const { alerts, loading: alertsLoading, stats: alertStats } = useAlerts();
  const queryClient = useQueryClient();

  const { data: updates = [], isLoading: updatesLoading } = useQuery({
    queryKey: ['project-updates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_updates').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as ProjectUpdate[];
    },
  });

  const { data: researchTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['research-tasks-monitoring'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('research_tasks').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: dbProjects = [] } = useQuery<{ id: string; name: string; slug: string }[]>({
    queryKey: ['db-projects-lookup'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, slug').eq('approved', true);
      return (data || []) as { id: string; name: string; slug: string }[];
    },
  });

  const { data: contactCount = 0 } = useQuery({
    queryKey: ['contact-count'],
    queryFn: async () => {
      const { count } = await supabase.from('project_contacts').select('*', { count: 'exact', head: true });
      return count || 0;
    },
  });

  const { data: evidenceCount = 0 } = useQuery({
    queryKey: ['evidence-count'],
    queryFn: async () => {
      const { count } = await supabase.from('evidence_sources').select('*', { count: 'exact', head: true });
      return count || 0;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('monitoring-realtime-full')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_updates' }, () => queryClient.invalidateQueries({ queryKey: ['project-updates'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'research_tasks' }, () => queryClient.invalidateQueries({ queryKey: ['research-tasks-monitoring'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => queryClient.invalidateQueries({ queryKey: ['alerts'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => queryClient.invalidateQueries({ queryKey: ['db-projects-lookup'] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const dbProjectMap = new Map(dbProjects.map(p => [p.id, p]));

  // KPI computations
  const activeProjects = useMemo(() => projects.filter(p => ['Construction', 'Financing', 'Awarded'].includes(p.stage)).length, [projects]);
  const recentUpdates24h = useMemo(() => updates.filter(u => new Date(u.created_at) > new Date(Date.now() - 86400000)).length, [updates]);
  const staleProjects = useMemo(() => projects.filter(p => Date.now() - new Date(p.lastUpdated).getTime() > 30 * 86400000), [projects]);
  const verifiedCount = useMemo(() => projects.filter(p => p.status === 'Verified').length, [projects]);
  const agentRuns24h = useMemo(() => researchTasks.filter(t => new Date(t.created_at).getTime() > Date.now() - 86400000).length, [researchTasks]);
  const agentSuccessRate = useMemo(() => {
    const completed = researchTasks.filter(t => t.status === 'completed').length;
    return researchTasks.length ? Math.round((completed / researchTasks.length) * 100) : 0;
  }, [researchTasks]);

  // Updates over time (last 7 days)
  const updatesTimeline = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      days[d.toLocaleDateString('en', { weekday: 'short' })] = 0;
    }
    updates.forEach(u => {
      const d = new Date(u.created_at);
      if (Date.now() - d.getTime() <= 7 * 86400000) {
        const key = d.toLocaleDateString('en', { weekday: 'short' });
        if (key in days) days[key]++;
      }
    });
    return Object.entries(days).map(([day, count]) => ({ day, count }));
  }, [updates]);

  // Field change distribution
  const fieldDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    updates.forEach(u => { map[u.field_changed] = (map[u.field_changed] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [updates]);

  // Alert severity breakdown
  const alertSeverityData = useMemo(() => {
    const map: Record<string, number> = {};
    alerts.forEach(a => { map[a.severity] = (map[a.severity] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [alerts]);

  // Agent task status breakdown
  const agentStatusData = useMemo(() => {
    const map: Record<string, number> = {};
    researchTasks.forEach(t => { map[t.status] = (map[t.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [researchTasks]);

  const agentStatusColors: Record<string, string> = { completed: '#22c55e', running: '#f59e0b', pending: '#3b82f6', failed: '#ef4444' };

  // Agent runs timeline (last 7 days)
  const agentTimeline = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      days[d.toLocaleDateString('en', { weekday: 'short' })] = 0;
    }
    researchTasks.forEach(t => {
      const d = new Date(t.created_at);
      if (Date.now() - d.getTime() <= 7 * 86400000) {
        const key = d.toLocaleDateString('en', { weekday: 'short' });
        if (key in days) days[key]++;
      }
    });
    return Object.entries(days).map(([day, count]) => ({ day, count }));
  }, [researchTasks]);

  const KPIs = [
    { label: 'Active projects', value: activeProjects, icon: Activity, color: 'text-primary' },
    { label: 'Verified', value: verifiedCount, icon: ShieldCheck, color: 'text-emerald-400' },
    { label: 'Updates (24h)', value: recentUpdates24h, icon: RefreshCw, color: 'text-blue-400' },
    { label: 'Stale (30d+)', value: staleProjects.length, icon: Clock, color: 'text-amber-400' },
    { label: 'Agent runs (24h)', value: agentRuns24h, icon: Bot, color: 'text-primary' },
    { label: 'Agent success', value: `${agentSuccessRate}%`, icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Unread alerts', value: alertStats.unread, icon: AlertTriangle, color: 'text-destructive' },
    { label: 'Critical alerts', value: alertStats.critical, icon: Zap, color: 'text-red-400' },
    { label: 'Contacts found', value: contactCount, icon: Users, color: 'text-blue-400' },
    { label: 'Evidence sources', value: evidenceCount, icon: TrendingUp, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" /> Platform monitoring
      </h1>
      <p className="text-sm text-muted-foreground">
        Real-time health and activity across projects, agents, alerts, and data quality.
      </p>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-5 lg:grid-cols-10">
        {KPIs.map(k => (
          <div key={k.label} className="glass-panel rounded-xl p-3">
            <k.icon className={`h-3.5 w-3.5 ${k.color} mb-1.5`} />
            {loading ? <Skeleton className="h-6 w-10" /> : <div className="text-lg font-serif font-bold">{k.value}</div>}
            <div className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Row 1: Updates timeline + Agent runs timeline */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-sm font-semibold mb-3">Project updates (7 days)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={updatesTimeline}>
              <defs>
                <linearGradient id="updateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(170 55% 63%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(170 55% 63%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 10% 18%)" />
              <XAxis dataKey="day" tick={{ fill: 'hsl(210 8% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(210 8% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
              <Area type="monotone" dataKey="count" stroke="hsl(170 55% 63%)" fill="url(#updateGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-sm font-semibold mb-3">Agent runs (7 days)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={agentTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 10% 18%)" />
              <XAxis dataKey="day" tick={{ fill: 'hsl(210 8% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(210 8% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={24} fill="#38bdf8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Field changes + Alert severity + Agent status */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-sm font-semibold mb-3">Most changed fields</h3>
          {updatesLoading ? <Skeleton className="h-[180px] w-full" /> : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={fieldDistribution} layout="vertical" margin={{ left: 5, right: 15 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill: 'hsl(210 8% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={12}>
                  {fieldDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-sm font-semibold mb-3">Alert severity breakdown</h3>
          {alertsLoading ? <Skeleton className="h-[180px] w-full" /> : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={alertSeverityData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={3} stroke="none">
                    {alertSeverityData.map(s => <Cell key={s.name} fill={SEVERITY_COLORS[s.name] || '#64748b'} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-1 justify-center">
                {alertSeverityData.map(s => (
                  <span key={s.name} className="flex items-center gap-1 text-[10px] text-muted-foreground capitalize">
                    <span className="w-2 h-2 rounded-full" style={{ background: SEVERITY_COLORS[s.name] || '#64748b' }} />{s.name} ({s.value})
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-sm font-semibold mb-3">Agent task status</h3>
          {tasksLoading ? <Skeleton className="h-[180px] w-full" /> : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={agentStatusData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={3} stroke="none">
                    {agentStatusData.map(s => <Cell key={s.name} fill={agentStatusColors[s.name] || '#64748b'} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-1 justify-center">
                {agentStatusData.map(s => (
                  <span key={s.name} className="flex items-center gap-1 text-[10px] text-muted-foreground capitalize">
                    <span className="w-2 h-2 rounded-full" style={{ background: agentStatusColors[s.name] || '#64748b' }} />{s.name} ({s.value})
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stale projects warning */}
      {staleProjects.length > 0 && (
        <div className="glass-panel rounded-xl p-5 border border-amber-500/20">
          <h3 className="font-serif text-sm font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" /> Confidence decay warning
          </h3>
          <p className="text-xs text-muted-foreground mb-3">These projects have not been updated in 30+ days; confidence may be declining.</p>
          <div className="flex flex-wrap gap-2">
            {staleProjects.slice(0, 10).map(p => (
              <Link key={p.id} to={`/dashboard/projects/${p.id}`}>
                <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10 cursor-pointer">
                  {p.name} <ArrowRight className="h-2.5 w-2.5 ml-1" />
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent agent activity */}
      <div className="glass-panel rounded-xl p-5">
        <h3 className="font-serif text-sm font-semibold mb-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" /> Recent agent activity
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tasksLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          ) : researchTasks.slice(0, 9).map(task => {
            const isCompleted = task.status === 'completed';
            const isFailed = task.status === 'failed';
            const TaskIcon = task.task_type === 'discovery' ? Search : task.task_type === 'update_check' ? RefreshCw : task.task_type === 'contact_finder' ? Users : ShieldAlert;
            return (
              <div key={task.id} className="flex items-center gap-2.5 p-3 rounded-lg bg-secondary/30 border border-border/20">
                <div className={`rounded-full p-1.5 ${isCompleted ? 'bg-primary/20' : isFailed ? 'bg-destructive/20' : 'bg-amber-500/20'}`}>
                  <TaskIcon className={`h-3.5 w-3.5 ${isCompleted ? 'text-primary' : isFailed ? 'text-destructive' : 'text-amber-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium capitalize truncate">{task.task_type.replace(/_/g, ' ')}</span>
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 ${isCompleted ? 'text-primary border-primary/30' : isFailed ? 'text-destructive border-destructive/30' : 'text-amber-500 border-amber-500/30'}`}>
                      {task.status}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 truncate">{new Date(task.created_at).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent updates feed */}
      <div className="glass-panel rounded-xl p-5">
        <h3 className="font-serif text-sm font-semibold mb-3">Recent project updates</h3>
        {updatesLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : updates.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No updates recorded yet. Run agents to generate updates.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-xs">Project</TableHead>
                  <TableHead className="text-xs">Field</TableHead>
                  <TableHead className="text-xs">Change</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {updates.slice(0, 25).map(u => {
                  const proj = dbProjectMap.get(u.project_id);
                  return (
                    <TableRow key={u.id} className="border-border/50">
                      <TableCell className="text-xs font-medium">
                        {proj ? (
                          <Link to={`/dashboard/projects/${proj.slug}`} className="text-primary hover:underline">{proj.name}</Link>
                        ) : <span className="text-muted-foreground">Unknown</span>}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] capitalize">{u.field_changed}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs">
                          {u.old_value && <span className="text-red-400 line-through truncate max-w-[80px]">{u.old_value}</span>}
                          {u.old_value && u.new_value && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                          {u.new_value && <span className="text-emerald-400 truncate max-w-[80px]">{u.new_value}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[10px]">{u.source || '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-[10px]">{new Date(u.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
