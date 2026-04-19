import { useEffect, useMemo, useState } from 'react';
import { useProjects } from '@/hooks/use-projects';
import { useAuth } from '@/contexts/AuthContext';
import { useAlerts } from '@/hooks/use-alerts';
import { useTrackedProjects } from '@/hooks/use-tracked-projects';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  TrendingUp, ShieldCheck, Activity, AlertTriangle, Bot, Search,
  RefreshCw, ShieldAlert, CheckCircle2, ClipboardCheck, DollarSign, Zap, Users,
  ExternalLink, Award, Star, Briefcase, ChevronDown, ChevronUp, Circle, X,
} from 'lucide-react';
import { useAlertRules } from '@/hooks/use-alert-rules';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import OverviewMap from '@/components/dashboard/OverviewMap';

const CHART_COLORS = ['#5eead4', '#38bdf8', '#a78bfa', '#fb923c', '#f87171', '#34d399'];

export default function DashboardOverview() {
  const { profile, hasRole } = useAuth();
  const isStaff = hasRole('admin') || hasRole('researcher');
  const filters = profile?.onboarded ? { regions: profile.regions, sectors: profile.sectors, stages: profile.stages } : undefined;
  const { projects, allProjects, loading: projectsLoading } = useProjects(filters);
  const { alerts, loading: alertsLoading, stats: alertStats } = useAlerts();
  const hasPreferenceFilters =
    !!profile?.onboarded &&
    ((profile.regions?.length ?? 0) > 0 || (profile.sectors?.length ?? 0) > 0 || (profile.stages?.length ?? 0) > 0);
  const { trackedProjects, isLoading: trackedLoading } = useTrackedProjects();
  const queryClient = useQueryClient();
  const [viewScope, setViewScope] = useState<'platform' | 'coverage'>(hasPreferenceFilters ? 'coverage' : 'platform');

  const { data: researchTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['research-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('research_tasks').select('*').order('created_at', { ascending: false }).limit(10);
      if (error) throw error;
      return data;
    },
    enabled: isStaff,
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pending-count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('approved', false);
      if (error) throw error;
      return count || 0;
    },
    enabled: isStaff,
  });

  const { rules: alertRules } = useAlertRules();
  const [checklistOpen, setChecklistOpen] = useState(true);
  const [checklistDismissed, setChecklistDismissed] = useState(() => {
    try { return localStorage.getItem('infradar_checklist_dismissed') === '1'; } catch { return false; }
  });

  const { data: userResearchCount = 0 } = useQuery({
    queryKey: ['user-research-count'],
    queryFn: async () => {
      const { count } = await supabase.from('research_tasks').select('id', { count: 'exact', head: true }).eq('task_type', 'user-research');
      return count || 0;
    },
  });

  const checklistSteps = useMemo(() => [
    {
      id: 'track', label: 'Track 5 projects', desc: 'Build your portfolio to monitor what matters most.', done: trackedProjects.length >= 5,
      action: { label: 'Browse projects', href: '/dashboard/projects' },
    },
    {
      id: 'alert', label: 'Set up an alert rule', desc: 'Get notified when risk signals match your filters.', done: alertRules.length > 0,
      action: { label: 'Configure alerts', href: '/dashboard/alerts' },
    },
    {
      id: 'research', label: 'Run an AI research query', desc: 'Ask anything about infrastructure projects.', done: userResearchCount > 0,
      action: { label: 'Open Research', href: '/dashboard/chat' },
    },
    {
      id: 'profile', label: 'Complete your profile', desc: 'Set your regions and sectors for personalised coverage.', done: !!(profile?.company && profile?.display_name),
      action: { label: 'Edit profile', href: '/dashboard/settings' },
    },
  ], [trackedProjects.length, alertRules.length, userResearchCount, profile]);

  const checklistDone = checklistSteps.filter(s => s.done).length;
  const allChecklistDone = checklistDone === checklistSteps.length;

  const { data: portfolioUpdateCount = 0 } = useQuery({
    queryKey: ['portfolio-update-count', trackedProjects.map(t => t.project_id)],
    queryFn: async () => {
      const ids = trackedProjects.map(t => t.project_id);
      if (!ids.length) return 0;
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('project_updates')
        .select('id', { count: 'exact', head: true })
        .in('project_id', ids)
        .gte('created_at', sevenDaysAgo);
      if (error) return 0;
      return count || 0;
    },
    enabled: !trackedLoading,
  });

  const { data: tenderCount = 0 } = useQuery({
    queryKey: ['tender-count'],
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('category', 'construction')
        .ilike('message', 'Contract: %')
        .gte('created_at', monthStart.toISOString());
      if (error) return 0;
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
    projects.forEach((p) => { s.add(p.name.trim().toLowerCase()); });
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

  // Platform-wide
  const marketTotalValue = useMemo(() => allProjects.reduce((s, p) => s + (p.valueUsd || 0), 0), [allProjects]);
  const marketAvgConfidence = useMemo(
    () => (allProjects.length ? Math.round(allProjects.reduce((s, p) => s + p.confidence, 0) / allProjects.length) : 0),
    [allProjects],
  );
  const marketVerifiedCount = useMemo(() => allProjects.filter((p) => p.status === 'Verified').length, [allProjects]);

  const globalRegionData = useMemo(() => {
    const map: Record<string, number> = {};
    allProjects.forEach((p) => { map[p.region] = (map[p.region] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [allProjects]);

  // Coverage
  const totalValue = useMemo(() => projects.reduce((s, p) => s + (p.valueUsd || 0), 0), [projects]);
  const avgConfidence = useMemo(() => projects.length ? Math.round(projects.reduce((s, p) => s + p.confidence, 0) / projects.length) : 0, [projects]);
  const verifiedCount = useMemo(() => projects.filter(p => p.status === 'Verified').length, [projects]);

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

  const confidenceTrend = useMemo(() => {
    const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    const offsets = [1, 0, 1, -1, 0, 1];
    const base = avgConfidence || 80;
    return months.map((month, i) => ({ month, value: Math.max(50, base - (5 - i) * 1.2 + offsets[i]) | 0 }));
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
      <h1 className="font-serif text-2xl font-bold">Infrastructure intelligence overview</h1>

      {/* Onboarding Checklist */}
      {!checklistDismissed && !allChecklistDone && (
        <div className="glass-panel rounded-xl border border-primary/20 overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none"
            onClick={() => setChecklistOpen(o => !o)}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {checklistSteps.map(s => (
                  <div key={s.id} className={`h-2 w-2 rounded-full ${s.done ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                ))}
              </div>
              <span className="text-sm font-medium">Getting started</span>
              <span className="text-xs text-muted-foreground">{checklistDone}/{checklistSteps.length} complete</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={e => { e.stopPropagation(); localStorage.setItem('infradar_checklist_dismissed', '1'); setChecklistDismissed(true); }}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
                aria-label="Dismiss checklist"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              {checklistOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
          {checklistOpen && (
            <div className="border-t border-border/30 divide-y divide-border/20">
              {checklistSteps.map(step => (
                <div key={step.id} className="flex items-center gap-4 px-5 py-3">
                  {step.done
                    ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    : <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${step.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                  {!step.done && (
                    <Link to={step.action.href} className="text-xs text-primary hover:underline shrink-0">{step.action.label} →</Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KPI section with Platform / My coverage toggle */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-serif text-lg font-semibold text-foreground">
            {viewScope === 'platform' ? 'Platform pipeline' : 'My coverage'}
          </h2>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button
              onClick={() => setViewScope('platform')}
              className={`px-3 py-1.5 transition-colors ${viewScope === 'platform' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              Platform
            </button>
            <button
              onClick={() => setViewScope('coverage')}
              className={`px-3 py-1.5 transition-colors ${viewScope === 'coverage' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              My coverage
            </button>
          </div>
        </div>

        {viewScope === 'platform' ? (
          <>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              {marketKPIs.map(k => (
                <div key={k.label} title={k.label} className="glass-panel rounded-xl p-4 cursor-default">
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
          </>
        ) : (
          <>
            {hasPreferenceFilters && (
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
            )}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              {focusKPIs.map(k => (
                <div key={k.label} title={k.label} className="glass-panel rounded-xl p-4 cursor-default">
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
          </>
        )}
      </div>

      {/* Action Hub */}
      <div className="space-y-3">
        <h2 className="font-serif text-lg font-semibold">Needs your attention</h2>
        <div className={`grid gap-3 grid-cols-1 sm:grid-cols-2 ${isStaff ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          {/* Critical alerts */}
          <Link to="/dashboard/alerts" className="glass-panel rounded-xl p-4 hover:border-primary/30 transition-colors group">
            <div className="flex items-start justify-between mb-3">
              <div className={`inline-flex p-1.5 rounded-lg ${focusAlertStats.critical > 0 ? 'bg-red-400/10' : 'bg-muted'}`}>
                <AlertTriangle className={`h-4 w-4 ${focusAlertStats.critical > 0 ? 'text-red-400' : 'text-muted-foreground'}`} />
              </div>
              {focusAlertStats.critical > 0 && (
                <span className="text-[10px] font-medium text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">Action needed</span>
              )}
            </div>
            {alertsLoading ? <Skeleton className="h-7 w-12 mb-1" /> : (
              <div className={`text-2xl font-serif font-bold ${focusAlertStats.critical > 0 ? 'text-red-400' : ''}`}>
                {focusAlertStats.critical}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-0.5">Critical alerts in your coverage</div>
            <div className="text-[10px] text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">View alerts →</div>
          </Link>

          {/* Portfolio updates */}
          <Link to="/dashboard/portfolio" className="glass-panel rounded-xl p-4 hover:border-primary/30 transition-colors group">
            <div className="flex items-start justify-between mb-3">
              <div className={`inline-flex p-1.5 rounded-lg ${portfolioUpdateCount > 0 ? 'bg-amber-400/10' : 'bg-muted'}`}>
                <Star className={`h-4 w-4 ${portfolioUpdateCount > 0 ? 'text-amber-400' : 'text-muted-foreground'}`} />
              </div>
              {trackedProjects.length > 0 && (
                <span className="text-[10px] text-muted-foreground">{trackedProjects.length} tracked</span>
              )}
            </div>
            {trackedLoading ? <Skeleton className="h-7 w-12 mb-1" /> : (
              <div className={`text-2xl font-serif font-bold ${portfolioUpdateCount > 0 ? 'text-amber-400' : ''}`}>
                {portfolioUpdateCount}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-0.5">Portfolio updates in last 7 days</div>
            <div className="text-[10px] text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">View portfolio →</div>
          </Link>

          {/* Tender events */}
          <Link to="/dashboard/tenders" className="glass-panel rounded-xl p-4 hover:border-primary/30 transition-colors group">
            <div className="flex items-start justify-between mb-3">
              <div className={`inline-flex p-1.5 rounded-lg ${tenderCount > 0 ? 'bg-blue-400/10' : 'bg-muted'}`}>
                <Award className={`h-4 w-4 ${tenderCount > 0 ? 'text-blue-400' : 'text-muted-foreground'}`} />
              </div>
              <span className="text-[10px] text-muted-foreground">this month</span>
            </div>
            <div className={`text-2xl font-serif font-bold ${tenderCount > 0 ? 'text-blue-400' : ''}`}>
              {tenderCount}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Tender & contract events</div>
            <div className="text-[10px] text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">View tenders →</div>
          </Link>

          {/* Pending review (staff only) */}
          {isStaff && (
            <Link to="/dashboard/review" className="glass-panel rounded-xl p-4 hover:border-primary/30 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <div className={`inline-flex p-1.5 rounded-lg ${pendingCount > 0 ? 'bg-amber-400/10' : 'bg-muted'}`}>
                  <ClipboardCheck className={`h-4 w-4 ${pendingCount > 0 ? 'text-amber-400' : 'text-muted-foreground'}`} />
                </div>
                {pendingCount > 0 && (
                  <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">Review needed</span>
                )}
              </div>
              <div className={`text-2xl font-serif font-bold ${pendingCount > 0 ? 'text-amber-400' : ''}`}>
                {pendingCount}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">AI-discovered projects pending review</div>
              <div className="text-[10px] text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Review now →</div>
            </Link>
          )}
        </div>
      </div>

      {/* Mini Map */}
      {!projectsLoading && <OverviewMap projects={projects} />}

      {/* Confidence trend */}
      <div className="glass-panel rounded-xl p-5">
        <h3 className="font-serif text-lg font-semibold mb-1">Confidence trend (your coverage)</h3>
        <p className="text-xs text-muted-foreground mb-3">Illustrative — historical time-series not yet available</p>
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

      {/* Agent Activity + Pending (staff only) */}
      {isStaff && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="glass-panel rounded-xl p-5">
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
      )}

      {/* Recent alerts & signals */}
      <div className="glass-panel rounded-xl p-5">
        <h3 className="font-serif text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-400" /> Recent alerts & signals
          <span className="text-sm font-normal text-muted-foreground ml-auto">
            {trackedProjects.length > 0 ? 'Tracked projects' : 'Your coverage'}
          </span>
        </h3>
        {alertsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg mb-2" />)
        ) : (() => {
          const trackedNames = new Set(
            trackedProjects
              .map(tp => allProjects.find(p => p.dbId === tp.project_id)?.name?.trim().toLowerCase())
              .filter(Boolean) as string[]
          );
          const feed = (trackedNames.size > 0
            ? focusAlerts.filter(a => trackedNames.has((a.projectName || '').trim().toLowerCase()))
            : focusAlerts
          ).slice(0, 8);

          return feed.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {trackedProjects.length > 0 ? 'No alerts for your tracked projects.' : 'No alerts in your coverage area.'}
            </p>
          ) : (
            <div className="space-y-2">
              {feed.map(a => (
                <div key={a.id} className="flex items-start gap-3 rounded-lg border border-border/50 p-3">
                  <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-destructive' : a.severity === 'high' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{a.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{a.projectName}</span>
                      <Badge variant="outline" className={`text-[9px] capitalize ${a.severity === 'critical' ? 'text-destructive border-destructive/30' : a.severity === 'high' ? 'text-amber-500 border-amber-500/30' : 'border-border'}`}>{a.severity}</Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">{a.time}</span>
                    </div>
                  </div>
                  {a.sourceUrl && (
                    <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
              <Link to="/dashboard/alerts" className="block text-center text-xs text-primary hover:underline pt-1">
                View all alerts →
              </Link>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
