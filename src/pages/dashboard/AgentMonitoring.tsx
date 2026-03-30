import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bot, CheckCircle, XCircle, Clock, RefreshCw, Search, ShieldAlert, Users, DollarSign, Scale, MessageSquare, Package, TrendingUp, Loader2, Radio, Phone, AlertTriangle, Database, Zap, GitMerge, Building2, Leaf, Shield, Gavel, ScrollText, Mail, FileText, Globe } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { agentApi } from '@/lib/api/agents';
import { useToast } from '@/hooks/use-toast';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { isEntitlementOrQuotaError, isStaffOnlyError } from '@/lib/billing/functionsErrors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

const AGENTS = [
  { type: 'discovery', name: 'Research Agent', icon: Search, schedule: 'Every 30 min', scheduleMinutes: 30, fn: agentApi.runResearchAgent },
  { type: 'update-check', name: 'Update Checker', icon: RefreshCw, schedule: 'Every 2 hours', scheduleMinutes: 120, fn: agentApi.runUpdateChecker },
  { type: 'risk-scoring', name: 'Risk Scorer', icon: ShieldAlert, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runRiskScorer },
  { type: 'stakeholder-intel', name: 'Stakeholder Intel', icon: Users, schedule: 'Every 6 hours', scheduleMinutes: 360, fn: agentApi.runStakeholderIntel },
  { type: 'funding-tracker', name: 'Funding Tracker', icon: DollarSign, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runFundingTracker },
  { type: 'regulatory-monitor', name: 'Regulatory Monitor', icon: Scale, schedule: 'Every 3 hours', scheduleMinutes: 180, fn: agentApi.runRegulatoryMonitor },
  { type: 'sentiment-analyzer', name: 'Sentiment Analyzer', icon: MessageSquare, schedule: 'Every 2 hours', scheduleMinutes: 120, fn: agentApi.runSentimentAnalyzer },
  { type: 'supply-chain-monitor', name: 'Supply Chain', icon: Package, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runSupplyChainMonitor },
  { type: 'market-intel', name: 'Market Intel', icon: TrendingUp, schedule: 'Every 6 hours', scheduleMinutes: 360, fn: agentApi.runMarketIntel },
  { type: 'contact-finder', name: 'Contact Finder', icon: Phone, schedule: 'Every 3 hours', scheduleMinutes: 180, fn: agentApi.runContactFinder },
  { type: 'alert-intelligence', name: 'Alert Intelligence', icon: AlertTriangle, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runAlertIntelligence },
  { type: 'data-enrichment', name: 'Data Enrichment', icon: Database, schedule: 'Every 2 hours', scheduleMinutes: 120, fn: agentApi.runDataEnrichment },
  { type: 'digest-agent', name: 'Digest Agent', icon: Mail, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runDigestAgent() },
  { type: 'dataset-refresh', name: 'Dataset Refresh', icon: Database, schedule: 'Hourly', scheduleMinutes: 60, fn: () => agentApi.runDatasetRefresh({ dataset_key: 'projects_v1' }) },
  { type: 'report-agent', name: 'Report Agent', icon: FileText, schedule: 'Weekly', scheduleMinutes: 10080, fn: () => agentApi.runReportAgent({ report_type: 'weekly_market_snapshot', days: 7 }) },
  { type: 'source-ingest', name: 'Source Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runSourceIngest({ url: '', source_key: 'infradar:manual' }) },
  { type: 'entity-dedup', name: 'Entity Dedup', icon: GitMerge, schedule: 'Daily', scheduleMinutes: 1440, fn: agentApi.runEntityDedup },
  { type: 'corporate-ma-monitor', name: 'Corporate / M&A', icon: Building2, schedule: 'Every 6 hours', scheduleMinutes: 360, fn: agentApi.runCorporateMaMonitor },
  { type: 'esg-social-monitor', name: 'ESG & Social', icon: Leaf, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runEsgSocialMonitor },
  { type: 'security-resilience', name: 'Security & Resilience', icon: Shield, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runSecurityResilience },
  { type: 'tender-award-monitor', name: 'Tender / Award', icon: Gavel, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runTenderAwardMonitor },
  { type: 'executive-briefing', name: 'Executive Briefing', icon: ScrollText, schedule: 'Daily', scheduleMinutes: 1440, fn: agentApi.runExecutiveBriefing },
];

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface LogEntry {
  id: string;
  task_type: string;
  status: string;
  query: string;
  error: string | null;
  result: any;
  created_at: string;
  completed_at: string | null;
}

const WORKFLOW_STEPS = ['Searching', 'Extracting', 'Analyzing', 'Saving'];

export default function AgentMonitoring() {
  const { toast } = useToast();
  const { canUseAi, isFreeTier, staffBypass, loading: entLoading } = useEntitlements();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: tasks, refetch } = useQuery({
    queryKey: ['research-tasks-monitoring'],
    queryFn: async () => {
      const { data } = await supabase
        .from('research_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      return data || [];
    },
    refetchInterval: 15000,
  });

  // Data coverage query
  const { data: projects } = useQuery({
    queryKey: ['projects-coverage'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, source_url, description, detailed_analysis, key_risks, funding_sources, environmental_impact, political_context').eq('approved', true);
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: contactCounts } = useQuery({
    queryKey: ['contact-coverage'],
    queryFn: async () => {
      const { data } = await supabase.from('project_contacts').select('project_id');
      const counts: Record<string, number> = {};
      (data || []).forEach(c => { counts[c.project_id] = (counts[c.project_id] || 0) + 1; });
      return counts;
    },
    refetchInterval: 60000,
  });

  const { data: evidenceCounts } = useQuery({
    queryKey: ['evidence-coverage'],
    queryFn: async () => {
      const { data } = await supabase.from('evidence_sources').select('project_id');
      const counts: Record<string, number> = {};
      (data || []).forEach(e => { counts[e.project_id] = (counts[e.project_id] || 0) + 1; });
      return counts;
    },
    refetchInterval: 60000,
  });

  // Seed live logs
  useEffect(() => {
    if (tasks && liveLogs.length === 0) {
      setLiveLogs(tasks.slice(0, 50).reverse() as LogEntry[]);
    }
  }, [tasks]);

  // Realtime subscription
  useEffect(() => {
    if (!isStreaming) return;
    const channel = supabase
      .channel('agent-logs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'research_tasks' }, (payload) => {
        const record = payload.new as LogEntry;
        if (!record?.id) return;
        setLiveLogs(prev => {
          const exists = prev.findIndex(l => l.id === record.id);
          if (exists >= 0) { const updated = [...prev]; updated[exists] = record; return updated; }
          return [...prev.slice(-99), record];
        });
        refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isStreaming, refetch]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [liveLogs]);

  // Activity timeline data (last 7 days)
  const activityTimeline = useMemo(() => {
    if (!tasks) return [];
    const now = Date.now();
    const days: { date: string; completed: number; failed: number; running: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const label = d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
      const dayTasks = tasks.filter(t => {
        const ct = new Date(t.created_at).getTime();
        return ct >= dayStart.getTime() && ct <= dayEnd.getTime();
      });
      days.push({
        date: label,
        completed: dayTasks.filter(t => t.status === 'completed').length,
        failed: dayTasks.filter(t => t.status === 'failed').length,
        running: dayTasks.filter(t => t.status === 'running').length,
      });
    }
    return days;
  }, [tasks]);

  // Data coverage metrics
  const dataCoverage = useMemo(() => {
    if (!projects?.length) return [];
    const total = projects.length;
    const metrics = [
      { label: 'Source URL', count: projects.filter(p => p.source_url && p.source_url !== '').length },
      { label: 'Description', count: projects.filter(p => p.description && p.description !== '').length },
      { label: 'Analysis', count: projects.filter(p => p.detailed_analysis && p.detailed_analysis !== '').length },
      { label: 'Key Risks', count: projects.filter(p => p.key_risks && p.key_risks !== '').length },
      { label: 'Funding', count: projects.filter(p => p.funding_sources && p.funding_sources !== '').length },
      { label: 'Environment', count: projects.filter(p => p.environmental_impact && p.environmental_impact !== '').length },
      { label: 'Political', count: projects.filter(p => p.political_context && p.political_context !== '').length },
      { label: 'Contacts', count: projects.filter(p => contactCounts && contactCounts[p.id]).length },
      { label: 'Evidence', count: projects.filter(p => evidenceCounts && evidenceCounts[p.id]).length },
    ];
    return metrics.map(m => ({ ...m, pct: Math.round((m.count / total) * 100), total }));
  }, [projects, contactCounts, evidenceCounts]);

  const getAgentStats = (taskType: string) => {
    const agentTasks = tasks?.filter(t => t.task_type === taskType) || [];
    const completed = agentTasks.filter(t => t.status === 'completed');
    const failed = agentTasks.filter(t => t.status === 'failed');
    const running = agentTasks.filter(t => t.status === 'running');
    const lastRun = agentTasks[0];
    const total = completed.length + failed.length;
    const successRate = total > 0 ? Math.round((completed.length / total) * 100) : null;
    return { completed: completed.length, failed: failed.length, running: running.length, lastRun, successRate, total };
  };

  const isStale = (agent: typeof AGENTS[0]) => {
    const stats = getAgentStats(agent.type);
    if (!stats.lastRun) return true;
    const minutesSince = (Date.now() - new Date(stats.lastRun.created_at).getTime()) / 60000;
    return minutesSince > agent.scheduleMinutes * 2;
  };

  const runAgent = async (name: string, fn: () => Promise<unknown>) => {
    if (!staffBypass) {
      toast({
        title: 'Team access required',
        description: 'Batch agents are limited to admin and researcher accounts.',
        variant: 'destructive',
      });
      return;
    }
    if (!canUseAi) {
      setUpgradeOpen(true);
      return;
    }
    setRunningAgent(name);
    try {
      await fn();
      toast({ title: `${name} triggered` });
      refetch();
    } catch (e: unknown) {
      if (isStaffOnlyError(e)) {
        toast({
          title: 'Team access required',
          description: 'Batch agents are restricted to admin or researcher accounts.',
          variant: 'destructive',
        });
        return;
      }
      if (isEntitlementOrQuotaError(e)) {
        setUpgradeOpen(true);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: `${name} failed`, description: msg, variant: 'destructive' });
    } finally {
      setRunningAgent(null);
    }
  };

  const totalRuns = tasks?.length || 0;
  const totalCompleted = tasks?.filter(t => t.status === 'completed').length || 0;
  const totalFailed = tasks?.filter(t => t.status === 'failed').length || 0;
  const totalRunning = tasks?.filter(t => t.status === 'running').length || 0;
  const staleCount = AGENTS.filter(a => isStale(a)).length;

  const agentNameMap: Record<string, string> = {};
  AGENTS.forEach(a => { agentNameMap[a.type] = a.name; });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-emerald-400';
      case 'failed': return 'text-destructive';
      case 'running': return 'text-amber-400';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-3 w-3 text-emerald-400" />;
      case 'failed': return <XCircle className="h-3 w-3 text-destructive" />;
      case 'running': return <Loader2 className="h-3 w-3 text-amber-400 animate-spin" />;
      default: return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  // Currently running agents for live process viz
  const runningAgents = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter(t => t.status === 'running').map(t => ({
      name: agentNameMap[t.task_type] || t.task_type,
      startedAt: t.created_at,
      elapsed: Math.floor((Date.now() - new Date(t.created_at).getTime()) / 1000),
    }));
  }, [tasks]);

  return (
    <div className="space-y-6">
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="ai" />
      {!entLoading && isFreeTier && (
        <Alert className="border-primary/30 bg-primary/5">
          <Zap className="h-4 w-4" />
          <AlertTitle>Explore every agent — run on a trial or paid plan</AlertTitle>
          <AlertDescription>
            You can browse schedules and logs on any account. Triggering agents uses your daily AI allowance; start a 3-day trial or subscribe from Billing when you are ready.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" /> Agent Monitoring
        </h1>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Runs</p>
          <p className="text-2xl font-bold">{totalRuns}</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Completed</p>
          <p className="text-2xl font-bold text-emerald-400">{totalCompleted}</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Failed</p>
          <p className="text-2xl font-bold text-destructive">{totalFailed}</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Running</p>
          <p className="text-2xl font-bold text-amber-400">{totalRunning}</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Stale Agents</p>
          <p className={`text-2xl font-bold ${staleCount > 3 ? 'text-destructive' : staleCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{staleCount}</p>
        </div>
      </div>

      {/* Activity Timeline + Live Process */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 7-day Activity */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> 7-Day Agent Activity
          </h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityTimeline}>
                <defs>
                  <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11, color: 'hsl(var(--foreground))' }} />
                <Area type="monotone" dataKey="completed" stroke="hsl(var(--primary))" fill="url(#completedGrad)" strokeWidth={2} name="Completed" />
                <Area type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" fill="url(#failedGrad)" strokeWidth={2} name="Failed" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Process Visualization */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-400 animate-pulse" /> Live Processes
          </h2>
          <div className="space-y-3">
            {runningAgents.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No agents currently running</p>
            )}
            {runningAgents.map((ra, i) => {
              const stepIndex = Math.min(Math.floor(ra.elapsed / 8), WORKFLOW_STEPS.length - 1);
              return (
                <div key={i} className="rounded-lg bg-background/50 border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{ra.name}</span>
                    <span className="text-[10px] text-muted-foreground">{ra.elapsed}s</span>
                  </div>
                  <div className="flex gap-1">
                    {WORKFLOW_STEPS.map((step, si) => (
                      <div key={step} className="flex-1">
                        <div className={`h-1.5 rounded-full transition-all duration-500 ${si < stepIndex ? 'bg-emerald-400' : si === stepIndex ? 'bg-amber-400 animate-pulse' : 'bg-muted'}`} />
                        <p className={`text-[8px] mt-0.5 text-center ${si === stepIndex ? 'text-amber-400 font-medium' : 'text-muted-foreground'}`}>{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Data Coverage Dashboard */}
      <div className="glass-panel rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" /> Data Coverage ({projects?.length || 0} projects)
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {dataCoverage.map(metric => (
            <div key={metric.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{metric.label}</span>
                <span className={`font-medium ${metric.pct >= 70 ? 'text-emerald-400' : metric.pct >= 40 ? 'text-amber-400' : 'text-destructive'}`}>
                  {metric.count}/{metric.total} ({metric.pct}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${metric.pct >= 70 ? 'bg-emerald-400' : metric.pct >= 40 ? 'bg-amber-400' : 'bg-destructive'}`}
                  style={{ width: `${metric.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {AGENTS.map(agent => {
          const stats = getAgentStats(agent.type);
          const Icon = agent.icon;
          const isRunningNow = runningAgent === agent.name || stats.running > 0;
          const stale = isStale(agent);

          return (
            <div key={agent.type} className={`glass-panel rounded-xl p-4 space-y-2.5 ${stale && !isRunningNow ? 'border border-amber-400/30' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold">{agent.name}</h3>
                    <p className="text-[9px] text-muted-foreground">{agent.schedule}</p>
                  </div>
                </div>
                {isRunningNow ? (
                  <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400/30 animate-pulse">Running</Badge>
                ) : stale ? (
                  <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400/30">⚠ Stale</Badge>
                ) : stats.lastRun?.status === 'completed' ? (
                  <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-400/30">Active</Badge>
                ) : stats.lastRun?.status === 'failed' ? (
                  <Badge variant="outline" className="text-[9px] text-destructive border-destructive/30">Error</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] text-muted-foreground">Idle</Badge>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded bg-background/50 py-1">
                  <p className="text-[10px] font-bold text-emerald-400">{stats.completed}</p>
                  <p className="text-[8px] text-muted-foreground">OK</p>
                </div>
                <div className="rounded bg-background/50 py-1">
                  <p className="text-[10px] font-bold text-destructive">{stats.failed}</p>
                  <p className="text-[8px] text-muted-foreground">Fail</p>
                </div>
                <div className="rounded bg-background/50 py-1">
                  <p className="text-[10px] font-bold">{stats.successRate !== null ? `${stats.successRate}%` : '-'}</p>
                  <p className="text-[8px] text-muted-foreground">Rate</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                <span>
                  {stats.lastRun ? `Last: ${timeAgo(stats.lastRun.created_at)}` : 'Never run'}
                </span>
                <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5" disabled={!!runningAgent} onClick={() => runAgent(agent.name, agent.fn)}>
                  {runningAgent === agent.name ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5 mr-0.5" />}
                  Run
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Log Stream */}
      <div className="glass-panel rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Radio className={`h-4 w-4 ${isStreaming ? 'text-emerald-400 animate-pulse' : 'text-muted-foreground'}`} />
            Live Agent Log Stream
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setIsStreaming(!isStreaming)}>
              {isStreaming ? 'Pause' : 'Resume'}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setLiveLogs([])}>
              Clear
            </Button>
          </div>
        </div>

        <div ref={scrollRef} className="h-64 overflow-y-auto rounded-lg bg-background/80 border border-border font-mono text-[11px] p-3 space-y-0.5">
          {liveLogs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Waiting for agent activity…</p>
          ) : (
            liveLogs.map((log) => (
              <div key={log.id}>
                <div className="flex items-start gap-2 py-0.5 hover:bg-muted/30 rounded px-1 cursor-pointer" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                  {getStatusIcon(log.status)}
                  <span className="text-muted-foreground shrink-0">{new Date(log.created_at).toLocaleTimeString()}</span>
                  <span className="text-primary font-medium shrink-0">[{agentNameMap[log.task_type] || log.task_type}]</span>
                  <span className={getStatusColor(log.status)}>{log.status.toUpperCase()}</span>
                  <span className="text-foreground truncate flex-1">{log.error ? `Error: ${log.error}` : log.query}</span>
                  <span className="text-muted-foreground shrink-0">{expandedLog === log.id ? '▼' : '▶'}</span>
                </div>
                {expandedLog === log.id && (
                  <div className="ml-5 my-1 p-3 rounded-lg bg-muted/20 border border-border space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                      <div><span className="text-muted-foreground">Task Type:</span> <span className="text-foreground">{log.task_type}</span></div>
                      <div><span className="text-muted-foreground">Status:</span> <span className={getStatusColor(log.status)}>{log.status}</span></div>
                      <div><span className="text-muted-foreground">Created:</span> <span className="text-foreground">{new Date(log.created_at).toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground">Completed:</span> <span className="text-foreground">{log.completed_at ? new Date(log.completed_at).toLocaleString() : '-'}</span></div>
                      <div className="col-span-2"><span className="text-muted-foreground">Query:</span> <span className="text-foreground">{log.query}</span></div>
                      {log.error && <div className="col-span-2"><span className="text-muted-foreground">Error:</span> <span className="text-destructive">{log.error}</span></div>}
                    </div>
                    {log.result && (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">Result JSON:</p>
                        <pre className="text-[10px] text-foreground bg-background/60 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto border border-border">
                          {JSON.stringify(log.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
