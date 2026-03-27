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

  const { data: researchTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['research-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('research_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pending-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('approved', false);
      if (error) throw error;
      return count || 0;
    },
  });

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

      {/* Research Activity Feed + Pending Review */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass-panel rounded-xl p-5 lg:col-span-2">
          <h3 className="font-serif text-lg font-semibold mb-4 flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agent activity
          </h3>
          <div className="space-y-3">
            {tasksLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : researchTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No agent runs yet. Trigger one from Settings.</p>
            ) : researchTasks.map(task => {
              const isCompleted = task.status === 'completed';
              const isFailed = task.status === 'failed';
              const isRunning = task.status === 'running';
              const result = task.result as Record<string, number> | null;
              const taskIcon = task.task_type === 'discovery' ? Search : task.task_type === 'update_check' ? RefreshCw : ShieldAlert;
              const TaskIcon = taskIcon;

              return (
                <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-border/30">
                  <div className={`mt-0.5 rounded-full p-1.5 ${isCompleted ? 'bg-primary/20' : isFailed ? 'bg-destructive/20' : 'bg-amber-500/20'}`}>
                    <TaskIcon className={`h-3.5 w-3.5 ${isCompleted ? 'text-primary' : isFailed ? 'text-destructive' : 'text-amber-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize">
                        {task.task_type === 'discovery' ? 'Research Agent' : task.task_type === 'update_check' ? 'Update Checker' : 'Risk Scorer'}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${isCompleted ? 'text-primary border-primary/30' : isFailed ? 'text-destructive border-destructive/30' : 'text-amber-500 border-amber-500/30'}`}>
                        {isRunning ? 'Running…' : task.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isCompleted && result ? (
                        <>
                          {result.extracted != null && <span>{result.extracted} extracted · </span>}
                          {result.inserted != null && <span>{result.inserted} new · </span>}
                          {result.updated != null && <span>{result.updated} updated</span>}
                          {result.checked != null && <span>{result.checked} checked · {result.updated} updated</span>}
                          {result.scored != null && <span>{result.scored} scored</span>}
                        </>
                      ) : isFailed ? (
                        <span className="text-destructive/80">{task.error || 'Unknown error'}</span>
                      ) : (
                        <span>{task.query}</span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {new Date(task.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending review card */}
        <div className="glass-panel rounded-xl p-5">
          <h3 className="font-serif text-lg font-semibold mb-4 flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Pending review
          </h3>
          <div className="flex flex-col items-center justify-center py-6">
            <div className="text-4xl font-serif font-bold text-primary">{pendingCount}</div>
            <p className="text-sm text-muted-foreground mt-1">AI-discovered projects</p>
            {pendingCount > 0 && (
              <Link
                to="/dashboard/review"
                className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <CheckCircle2 className="h-4 w-4" />
                Review now
              </Link>
            )}
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
