import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bot, CheckCircle, XCircle, Clock, RefreshCw, Search, ShieldAlert, Users, DollarSign, Scale, MessageSquare, Package, TrendingUp, Loader2, Radio, Phone, AlertTriangle, Database, Zap, GitMerge, Building2, Leaf, Shield, Gavel, ScrollText, Mail, FileText, Globe, Pause, Play, AlertCircle } from 'lucide-react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  timeAgo,
  computeAgentStats,
  isAgentStale,
  computeDataCoverage,
  computeActivityTimeline,
  type TaskRow,
} from '@/lib/agents/agentUtils';
import { agentApi } from '@/lib/api/agents';
import { useToast } from '@/hooks/use-toast';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { isEntitlementOrQuotaError, isStaffOnlyError } from '@/lib/billing/functionsErrors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

const AGENTS = [
  { type: 'discovery', name: 'Research Agent', icon: Search, schedule: 'Every 30 min', scheduleMinutes: 30, fn: agentApi.runResearchAgent },
  { type: 'world-bank-ingest', name: 'World Bank Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runWorldBankIngest({ status: 'Active,Pipeline', limit: 200 }) },
  { type: 'ifc-ingest', name: 'IFC Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runIfcIngest({ status: 'Active,Pipeline', limit: 200 }) },
  { type: 'adb-ingest', name: 'ADB Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runAdbIngest({ limit: 300 }) },
  { type: 'afdb-ingest', name: 'AfDB Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: agentApi.runAfdbIngest },
  { type: 'ebrd-ingest', name: 'EBRD Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: agentApi.runEbrdIngest },
  { type: 'iadb-ingest', name: 'IADB Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: () => agentApi.runIadbIngest({ status: 'Active,Implementation', limit: 300 }) },
  { type: 'aiib-ingest', name: 'AIIB Ingest', icon: Globe, schedule: 'Daily', scheduleMinutes: 1440, fn: agentApi.runAiibIngest },
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
  { type: 'entity-dedup', name: 'Entity Dedup', icon: GitMerge, schedule: 'Daily', scheduleMinutes: 1440, fn: agentApi.runEntityDedup },
  { type: 'corporate-ma-monitor', name: 'Corporate / M&A', icon: Building2, schedule: 'Every 6 hours', scheduleMinutes: 360, fn: agentApi.runCorporateMaMonitor },
  { type: 'esg-social-monitor', name: 'ESG & Social', icon: Leaf, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runEsgSocialMonitor },
  { type: 'security-resilience', name: 'Security & Resilience', icon: Shield, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runSecurityResilience },
  { type: 'tender-award-monitor', name: 'Tender / Award', icon: Gavel, schedule: 'Every 4 hours', scheduleMinutes: 240, fn: agentApi.runTenderAwardMonitor },
  { type: 'executive-briefing', name: 'Executive Briefing', icon: ScrollText, schedule: 'Daily', scheduleMinutes: 1440, fn: agentApi.runExecutiveBriefing },
  { type: 'source-ingest', name: 'Source Ingest', icon: Globe, schedule: 'On demand', scheduleMinutes: 0, fn: () => {
    const url = window.prompt('Enter the source URL to ingest (e.g. https://example.com/projects):');
    if (!url) return Promise.resolve();
    const source_key = window.prompt('Optional source key (leave blank to auto-detect):') || undefined;
    return agentApi.runSourceIngest({ url, source_key });
  } },
  { type: 'user-research', name: 'User Research', icon: Search, schedule: 'On demand', scheduleMinutes: 0, fn: () => {
    const query = window.prompt('Enter a research query (e.g. "Solar projects in Vietnam 2025"):');
    if (!query) return Promise.resolve();
    return agentApi.runUserResearch(query);
  } },
  { type: 'insight-sources', name: 'Insight Sources', icon: Zap, schedule: 'On demand', scheduleMinutes: 0, fn: () => agentApi.runInsightSourcesAgent() },
];

interface LogEntry {
  id: string;
  task_type: string;
  status: string;
  query: string;
  error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

interface SchedulerActivity {
  task_type: string;
  last_scheduler_run: string | null;
  scheduler_runs: number;
  scheduler_failures: number;
}

interface AgentConfigRow {
  agent_type: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  success_count: number;
  failure_count: number;
  last_duration_ms: number | null;
}

interface AgentMonitoringSummary {
  agent_configs: AgentConfigRow[];
  recent_tasks: TaskRow[];
  latest_tasks: TaskRow[];
  totals: {
    total_runs: number;
    completed: number;
    failed: number;
    running: number;
  };
}

interface PipelineSummary {
  candidate_counts?: Record<string, number>;
  source_health?: { total_sources?: number; active_sources?: number; failing_sources?: number; stale_sources?: number };
  quality?: { avg_score?: number; approve_ready?: number; needs_research?: number; missing_source?: number };
  review?: { pending_candidates?: number; high_confidence_pending?: number; update_proposals?: number };
  agent_events?: { events_24h?: number; errors_24h?: number };
}

const PAGE_SIZE = 1000;

async function fetchRecentResearchTasks(): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from('research_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);
  if (error) throw error;
  return (data ?? []) as unknown as TaskRow[];
}

const WORKFLOW_STEPS = ['Searching', 'Extracting', 'Analyzing', 'Saving'];

export default function AgentMonitoring() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canUseAi, isFreeTier, staffBypass, loading: entLoading } = useEntitlements();
  const staffReady = !entLoading && staffBypass;
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [togglingAgent, setTogglingAgent] = useState<string | null>(null);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: monitoringSummary, refetch: refetchSummary } = useQuery({
    queryKey: ['agent-monitoring-summary', staffBypass],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_agent_monitoring_summary', { p_recent_limit: 150 });
      if (error) throw error;
      return data as AgentMonitoringSummary;
    },
    enabled: staffReady,
    refetchInterval: staffReady ? 15000 : false,
  });

  const { data: taskPage, refetch: refetchTaskPage } = useQuery({
    queryKey: ['research-tasks-monitoring'],
    queryFn: fetchRecentResearchTasks,
    enabled: !staffReady,
    refetchInterval: !staffReady ? 15000 : false,
  });

  const tasks = monitoringSummary?.recent_tasks ?? taskPage;
  const refetch = useCallback(async () => {
    await Promise.all([refetchSummary(), refetchTaskPage()]);
  }, [refetchSummary, refetchTaskPage]);

  const { data: schedulerActivity } = useQuery({
    queryKey: ['agent-scheduler-activity', staffBypass],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_agent_scheduler_activity');
      if (error) throw error;
      return ((data ?? []) as SchedulerActivity[]).reduce<Record<string, SchedulerActivity>>((acc, row) => {
        acc[row.task_type] = row;
        return acc;
      }, {});
    },
    enabled: staffReady,
    refetchInterval: 30000,
  });

  const { data: pipelineSummary } = useQuery({
    queryKey: ['intelligence-pipeline-summary', staffBypass],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_intelligence_pipeline_summary');
      if (error) throw error;
      return data as PipelineSummary;
    },
    enabled: staffReady,
    refetchInterval: staffReady ? 30000 : false,
  });

  // Data coverage query - paginated so the 1000-row Supabase default cap does
  // not silently truncate the result when the project count exceeds 1000.
  const { data: projects } = useQuery({
    queryKey: ['projects-coverage'],
    queryFn: async () => {
      const all: unknown[] = [];
      let from = 0;
      for (let i = 0; i < 50; i++) {
        const { data, error } = await supabase
          .from('projects')
          .select('id, source_url, description, detailed_analysis, key_risks, funding_sources, environmental_impact, political_context')
          .eq('approved', true)
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    },
    enabled: staffReady,
    refetchInterval: staffReady ? 60000 : false,
  });

  const { data: contactCounts } = useQuery({
    queryKey: ['contact-coverage'],
    queryFn: async () => {
      const data: { project_id: string }[] = [];
      for (let from = 0; from < 50_000; from += PAGE_SIZE) {
        const { data: page, error } = await supabase.from('project_contacts').select('project_id').range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!page?.length) break;
        data.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      const counts: Record<string, number> = {};
      data.forEach(c => { counts[c.project_id] = (counts[c.project_id] || 0) + 1; });
      return counts;
    },
    enabled: staffReady,
    refetchInterval: staffReady ? 60000 : false,
  });

  const { data: evidenceCounts } = useQuery({
    queryKey: ['evidence-coverage'],
    queryFn: async () => {
      const data: { project_id: string }[] = [];
      for (let from = 0; from < 50_000; from += PAGE_SIZE) {
        const { data: page, error } = await supabase.from('evidence_sources').select('project_id').range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!page?.length) break;
        data.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
      const counts: Record<string, number> = {};
      data.forEach(e => { counts[e.project_id] = (counts[e.project_id] || 0) + 1; });
      return counts;
    },
    enabled: staffReady,
    refetchInterval: staffReady ? 60000 : false,
  });

  // Agent enabled/paused state
  const { data: agentConfigsFallback } = useQuery({
    queryKey: ['agent-configs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_config')
        .select('agent_type, enabled, last_run_at, last_run_status, success_count, failure_count, last_duration_ms');
      const map: Record<string, AgentConfigRow> = {};
      ((data ?? []) as AgentConfigRow[]).forEach(row => { map[row.agent_type] = row; });
      return map;
    },
    enabled: !staffReady,
    refetchInterval: !staffReady ? 30000 : false,
  });

  // Open auth-failure alerts (HTTP 401 / unauthorized cron failures)
  const { data: authAlerts, refetch: refetchAuthAlerts } = useQuery({
    queryKey: ['agent-health-alerts-open', staffBypass],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('agent_health_alerts')
        .select('id, job_name, severity, failure_count, total_runs, sample_message, detected_at, notified_at')
        .is('resolved_at', null)
        .eq('alert_type', 'cron_auth_failure')
        .order('detected_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; job_name: string | null; severity: string;
        failure_count: number; total_runs: number;
        sample_message: string | null; detected_at: string; notified_at: string | null;
      }>;
    },
    enabled: staffReady,
    refetchInterval: staffReady ? 30000 : false,
  });

  const resolveAuthAlert = useCallback(async (id: string) => {
    const { error } = await (supabase as any)
      .from('agent_health_alerts')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast({ title: 'Could not resolve alert', description: error.message, variant: 'destructive' });
      return;
    }
    refetchAuthAlerts();
  }, [refetchAuthAlerts, toast]);

  const runHealthMonitor = useCallback(async () => {
    try {
      const { error } = await supabase.functions.invoke('agent-health-monitor', { body: {} });
      if (error) throw error;
      toast({ title: 'Health check complete', description: 'Re-scanned cron history for auth failures.' });
      refetchAuthAlerts();
    } catch (e: any) {
      toast({ title: 'Health check failed', description: e?.message ?? String(e), variant: 'destructive' });
    }
  }, [toast, refetchAuthAlerts]);

  const syncServiceRoleKey = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('sync-service-role-to-vault', { body: {} });
      if (error) throw error;
      toast({
        title: 'Service role key synced',
        description: `Vault updated (${(data as any)?.key_fingerprint ?? 'ok'}). Re-running health check…`,
      });
      await supabase.functions.invoke('agent-health-monitor', { body: {} });
      refetchAuthAlerts();
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e?.message ?? String(e), variant: 'destructive' });
    }
  }, [toast, refetchAuthAlerts]);

  // Rolling-window health status from the agent_health view
  const { data: agentHealth } = useQuery({
    queryKey: ['agent-health', staffBypass],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('agent_health')
        .select('agent_type, health_status, recent_runs_24h, recent_failure_rate_pct, success_rate_pct');
      if (error) throw error;
      const map: Record<string, { health_status: string; recent_runs_24h: number; recent_failure_rate_pct: number | null; success_rate_pct: number | null }> = {};
      ((data ?? []) as any[]).forEach(row => { map[row.agent_type] = row; });
      return map;
    },
    enabled: staffReady,
    refetchInterval: staffReady ? 30000 : false,
  });

  const agentConfigs = useMemo(() => {
    if (monitoringSummary?.agent_configs) {
      return monitoringSummary.agent_configs.reduce<Record<string, AgentConfigRow>>((acc, row) => {
        acc[row.agent_type] = row;
        return acc;
      }, {});
    }
    return agentConfigsFallback;
  }, [monitoringSummary, agentConfigsFallback]);

  const toggleMutation = useMutation({
    mutationFn: async ({ agentType, enabled }: { agentType: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('agent_config')
        .upsert({ agent_type: agentType, enabled, updated_at: new Date().toISOString() }, { onConflict: 'agent_type' });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['agent-configs'] }); queryClient.invalidateQueries({ queryKey: ['agent-monitoring-summary'] }); },
  });

  const [resettingAgent, setResettingAgent] = useState<string | null>(null);
  const resetStuckAgent = async (agentType: string, agentName: string) => {
    if (!staffBypass) {
      toast({ title: 'Team access required', description: 'Only staff can reset stuck agents.', variant: 'destructive' });
      return;
    }
    setResettingAgent(agentType);
    try {
      const { data, error } = await supabase.rpc('reset_stuck_agent_task' as never, { p_agent_type: agentType } as never);
      if (error) throw error;
      const count = (data as { reset_count?: number } | null)?.reset_count ?? 0;
      toast({
        title: count > 0 ? `Reset ${agentName}` : `${agentName} had nothing to reset`,
        description: count > 0 ? `Cleared ${count} stuck task${count === 1 ? '' : 's'}. Next scheduled run will proceed.` : 'No running tasks were found.',
      });
      queryClient.invalidateQueries({ queryKey: ['agent-monitoring-summary'] });
      queryClient.invalidateQueries({ queryKey: ['agent-configs'] });
      queryClient.invalidateQueries({ queryKey: ['agent-tasks'] });
    } catch (e) {
      toast({ title: 'Reset failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setResettingAgent(null);
    }
  };


  const toggleAgent = async (agentType: string, currentlyEnabled: boolean) => {
    if (!staffBypass) {
      toast({ title: 'Team access required', description: 'Only admin and researcher accounts can pause agents.', variant: 'destructive' });
      return;
    }
    setTogglingAgent(agentType);
    try {
      await toggleMutation.mutateAsync({ agentType, enabled: !currentlyEnabled });
      toast({ title: currentlyEnabled ? `Agent paused` : `Agent resumed`, description: currentlyEnabled ? 'Agent will not run until resumed.' : 'Agent is now active.' });
    } catch (e) {
      toast({ title: 'Failed to update agent', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setTogglingAgent(null);
    }
  };

  // Seed live logs from the initial fetch. Use a ref to track whether we have
  // seeded so we avoid re-seeding on every refetch while still catching the
  // case where the user clears logs and then tasks refetches with new data.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!tasks) return;
    if (!seededRef.current || liveLogs.length === 0) {
      seededRef.current = true;
      setLiveLogs(tasks.slice(0, 50).reverse() as LogEntry[]);
    }
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Activity timeline and data coverage - delegate to pure utils so the same
  // logic can be tested in isolation without DOM or Supabase dependencies.
  const activityTimeline = useMemo(
    () => computeActivityTimeline(tasks ?? []),
    [tasks],
  );

  const dataCoverage = useMemo(
    () => computeDataCoverage(
      (projects ?? []) as Parameters<typeof computeDataCoverage>[0],
      contactCounts ?? {},
      evidenceCounts ?? {},
    ),
    [projects, contactCounts, evidenceCounts],
  );

  const getAgentStats = (taskType: string) => {
    const taskStats = computeAgentStats(tasks ?? [], taskType);
    const summary = agentConfigs?.[taskType];
    if (!summary) return taskStats;
    return {
      ...taskStats,
      completed: Math.max(taskStats.completed, summary.success_count ?? 0),
      failed: Math.max(taskStats.failed, summary.failure_count ?? 0),
      total: Math.max(taskStats.total, (summary.success_count ?? 0) + (summary.failure_count ?? 0)),
      successRate: ((summary.success_count ?? 0) + (summary.failure_count ?? 0)) > 0
        ? Math.round(((summary.success_count ?? 0) / ((summary.success_count ?? 0) + (summary.failure_count ?? 0))) * 100)
        : taskStats.successRate,
      lastRun: taskStats.lastRun ?? (summary.last_run_at ? {
        id: `${taskType}-summary`,
        task_type: taskType,
        status: summary.last_run_status ?? 'completed',
        query: '',
        error: null,
        result: null,
        created_at: summary.last_run_at,
        completed_at: summary.last_run_at,
        current_step: null,
      } : undefined),
    };
  };

  const getAgentRunTotal = (agent: typeof AGENTS[0]) => {
    const summaryRuns = agentConfigs?.[agent.type]
      ? (agentConfigs[agent.type].success_count ?? 0) + (agentConfigs[agent.type].failure_count ?? 0)
      : 0;
    const schedulerRuns = schedulerActivity?.[agent.type]?.scheduler_runs ?? 0;
    const recentRuns = getAgentStats(agent.type).total;
    return Math.max(summaryRuns, schedulerRuns, recentRuns);
  };

  const getLastActivityAt = (agent: typeof AGENTS[0]) => {
    const taskLastRun = getAgentStats(agent.type).lastRun?.created_at;
    const summaryLastRun = agentConfigs?.[agent.type]?.last_run_at ?? undefined;
    const schedulerLastRun = schedulerActivity?.[agent.type]?.last_scheduler_run ?? undefined;
    return [taskLastRun, summaryLastRun, schedulerLastRun]
      .filter(Boolean)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];
  };

  const isStale = (agent: typeof AGENTS[0]) =>
    isAgentStale(getLastActivityAt(agent), agent.scheduleMinutes);

  const getAgentState = (agent: typeof AGENTS[0], isEnabled: boolean, isRunningNow: boolean, stale: boolean, lastStatus?: string | null) => {
    if (!isEnabled) return { label: 'Paused', className: 'text-muted-foreground border-muted/40 bg-muted/10' };
    if (isRunningNow) return { label: 'Running', className: 'text-amber-400 border-amber-400/30 bg-amber-400/10' };
    if (stale) return { label: 'Stale', className: 'text-amber-400 border-amber-400/30 bg-amber-400/10' };
    if (lastStatus === 'failed') return { label: 'Error', className: 'text-destructive border-destructive/30 bg-destructive/10' };
    if (lastStatus === 'completed') return { label: 'Healthy', className: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10' };
    return { label: 'Idle', className: 'text-muted-foreground border-border bg-background/40' };
  };

  const getThroughput24h = (taskType: string) => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const runs = (tasks ?? []).filter(t => t.task_type === taskType && new Date(t.created_at).getTime() >= since);
    return {
      total: runs.length,
      completed: runs.filter(t => t.status === 'completed').length,
      failed: runs.filter(t => t.status === 'failed').length,
    };
  };

  const formatDuration = (ms?: number | null) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.round(seconds / 60)}m`;
  };

  const runAgent = async (name: string, fn: (() => Promise<unknown>) | null) => {
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
    if (!fn) {
      toast({
        title: 'Parameters required',
        description: 'This agent requires parameters and must be triggered from the API.',
      });
      return;
    }
    setRunningAgent(name);
    try {
      await fn();
      toast({ title: `${name} triggered` });
      await refetch();
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

  // All authenticated users see every agent card so they can inspect schedules
  // and run histories. The Run / Pause buttons inside each card are gated by
  // staffBypass separately - the filter below was previously wrong and only
  // showed agents that were paused or currently running (empty for most users).
  const visibleAgents = AGENTS;

  const summaryRows = Object.values(agentConfigs ?? {});
  const totalRuns = monitoringSummary?.totals?.total_runs ?? (summaryRows.length
    ? summaryRows.reduce((sum, row) => sum + (row.success_count ?? 0) + (row.failure_count ?? 0), 0)
    : tasks?.length || 0);
  const totalCompleted = monitoringSummary?.totals?.completed ?? (summaryRows.length
    ? summaryRows.reduce((sum, row) => sum + (row.success_count ?? 0), 0)
    : tasks?.filter(t => t.status === 'completed').length || 0);
  const totalFailed = monitoringSummary?.totals?.failed ?? (summaryRows.length
    ? summaryRows.reduce((sum, row) => sum + (row.failure_count ?? 0), 0)
    : tasks?.filter(t => t.status === 'failed').length || 0);
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

  // Currently running agents for live process viz.
  // Include the local runningAgent state so the panel and count update the
  // instant Run is clicked, without waiting for the 15s refetch or a realtime
  // notification to deliver the DB-side 'running' row.
  const runningAgents = useMemo(() => {
    const dbRunning = (tasks ?? [])
      .filter(t => t.status === 'running')
      .map(t => ({
        name: agentNameMap[t.task_type] || t.task_type,
        startedAt: t.created_at,
        elapsed: Math.floor((Date.now() - new Date(t.created_at).getTime()) / 1000),
        currentStep: t.current_step ?? null,
      }));
    if (runningAgent && !dbRunning.some(r => r.name === runningAgent)) {
      dbRunning.unshift({ name: runningAgent, startedAt: new Date().toISOString(), elapsed: 0, currentStep: null });
    }
    return dbRunning;
  }, [tasks, runningAgent]);

  const totalRunning = monitoringSummary?.totals?.running ?? runningAgents.length;

  return (
    <div className="space-y-6">
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="ai" />
      {!entLoading && isFreeTier && (
        <Alert className="border-primary/30 bg-primary/5">
          <Zap className="h-4 w-4" />
          <AlertTitle>Browse all agents — trigger them on a paid plan</AlertTitle>
          <AlertDescription>
            You can inspect schedules, run histories, and live logs on any account. Manually triggering agents uses your daily AI allowance and requires a Starter or Pro subscription.
          </AlertDescription>
        </Alert>
      )}
      {staffReady && authAlerts && authAlerts.length > 0 && (
        <Alert variant="destructive" className="border-destructive/50">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="flex items-center justify-between gap-3">
            <span>{authAlerts.length} scheduled agent{authAlerts.length === 1 ? '' : 's'} failing with HTTP 401 / unauthorized</span>
            <div className="flex gap-2">
              <Button size="sm" variant="default" onClick={syncServiceRoleKey} className="h-7">
                Sync key from env → vault
              </Button>
              <Button size="sm" variant="outline" onClick={runHealthMonitor} className="h-7">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-check now
              </Button>
            </div>
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-sm">
              Cron is invoking these jobs but the auth header is being rejected. Most common cause: the
              <code className="mx-1 px-1.5 py-0.5 rounded bg-background/50 font-mono text-xs">email_queue_service_role_key</code>
              vault secret is stale. Rotate it to match the current <code className="px-1.5 py-0.5 rounded bg-background/50 font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code> to restore the fleet.
            </p>
            <div className="space-y-1 mt-2">
              {authAlerts.slice(0, 8).map(a => (
                <div key={a.id} className="flex items-start justify-between gap-3 text-xs bg-background/40 rounded px-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono font-semibold">{a.job_name ?? 'unknown'}</span>
                    <span className="text-muted-foreground"> — {a.failure_count} auth fails / {a.total_runs} runs · {timeAgo(a.detected_at)}</span>
                    {a.sample_message && (
                      <div className="text-muted-foreground/80 truncate mt-0.5">{a.sample_message.slice(0, 200)}</div>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => resolveAuthAlert(a.id)}>
                    Resolve
                  </Button>
                </div>
              ))}
              {authAlerts.length > 8 && (
                <p className="text-xs text-muted-foreground">+ {authAlerts.length - 8} more</p>
              )}
            </div>
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

      {staffReady && pipelineSummary && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="glass-panel rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Pipeline Health</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Pending Review</p><p className="text-xl font-bold">{pipelineSummary.review?.pending_candidates ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">Update Proposals</p><p className="text-xl font-bold">{pipelineSummary.review?.update_proposals ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">High Confidence</p><p className="text-xl font-bold">{pipelineSummary.review?.high_confidence_pending ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">Events 24h</p><p className="text-xl font-bold">{pipelineSummary.agent_events?.events_24h ?? 0}</p></div>
            </div>
          </div>
          <div className="glass-panel rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Quality Intelligence</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Avg Score</p><p className="text-xl font-bold">{pipelineSummary.quality?.avg_score ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">Approve Ready</p><p className="text-xl font-bold">{pipelineSummary.quality?.approve_ready ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">Needs Research</p><p className="text-xl font-bold">{pipelineSummary.quality?.needs_research ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">Missing Source</p><p className="text-xl font-bold">{pipelineSummary.quality?.missing_source ?? 0}</p></div>
            </div>
          </div>
          <div className="glass-panel rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> Source Reliability</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Sources</p><p className="text-xl font-bold">{pipelineSummary.source_health?.total_sources ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">Active</p><p className="text-xl font-bold">{pipelineSummary.source_health?.active_sources ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">Failing</p><p className="text-xl font-bold">{pipelineSummary.source_health?.failing_sources ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">Stale</p><p className="text-xl font-bold">{pipelineSummary.source_health?.stale_sources ?? 0}</p></div>
            </div>
          </div>
        </div>
      )}

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
              // Use real step from DB if available, fall back to time-estimate
              const realStepIdx = ra.currentStep
                ? WORKFLOW_STEPS.findIndex(s => s.toLowerCase() === ra.currentStep!.toLowerCase())
                : -1;
              const stepIndex = realStepIdx >= 0
                ? realStepIdx
                : Math.min(Math.floor(ra.elapsed / 8), WORKFLOW_STEPS.length - 1);
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

      {/* Data Coverage Dashboard — staff only */}
      {staffReady && (
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
      )}

      {/* Agent state table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> Agent State Matrix
          </h2>
          <p className="text-xs text-muted-foreground">Throughput is based on recent runs in the last 24 hours</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-background/50 text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left font-medium">Agent</th>
                <th className="px-4 py-3 text-left font-medium">State</th>
                <th className="px-4 py-3 text-left font-medium">Last run</th>
                <th className="px-4 py-3 text-right font-medium">Success</th>
                <th className="px-4 py-3 text-right font-medium">Errors</th>
                <th className="px-4 py-3 text-right font-medium">Throughput</th>
                <th className="px-4 py-3 text-right font-medium">Avg duration</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleAgents.map(agent => {
                const stats = getAgentStats(agent.type);
                const Icon = agent.icon;
                const isRunningNow = runningAgent === agent.name || stats.running > 0;
                const stale = isStale(agent);
                const lastActivityAt = getLastActivityAt(agent);
                const config = agentConfigs?.[agent.type];
                const isEnabled = agentConfigs ? (config?.enabled !== false) : true;
                const state = getAgentState(agent, isEnabled, isRunningNow, stale, stats.lastRun?.status ?? config?.last_run_status);
                const throughput = getThroughput24h(agent.type);

                return (
                  <tr key={agent.type} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{agent.name}</p>
                          <p className="text-[10px] text-muted-foreground">{agent.schedule}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-[10px] ${state.className}`}>{state.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {lastActivityAt ? timeAgo(lastActivityAt) : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-400">{stats.completed}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-destructive">{stats.failed}</td>
                    <td className="px-4 py-3 text-right text-xs text-foreground whitespace-nowrap">
                      {throughput.total}/24h
                      <span className="ml-1 text-[10px] text-muted-foreground">({throughput.completed} ok, {throughput.failed} err)</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">{formatDuration(config?.last_duration_ms)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px]"
                        disabled={!staffBypass || resettingAgent === agent.type || (!isRunningNow && stats.running === 0)}
                        onClick={() => resetStuckAgent(agent.type, agent.name)}
                        title="Force-clear any stuck running task for this agent"
                      >
                        {resettingAgent === agent.type ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <AlertCircle className="h-3 w-3 mr-1" /> Reset
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleAgents.length === 0 && !staffBypass && (
          <div className="col-span-full text-center py-8 text-sm text-muted-foreground">
            No agents are currently running or paused.
          </div>
        )}
        {visibleAgents.map(agent => {
          const stats = getAgentStats(agent.type);
          const Icon = agent.icon;
          const isRunningNow = runningAgent === agent.name || stats.running > 0;
          const stale = isStale(agent);
          const lastActivityAt = getLastActivityAt(agent);
          const agentRuns = getAgentRunTotal(agent);
          const isEnabled = agentConfigs ? (agentConfigs[agent.type]?.enabled !== false) : true;
          const isPaused = !isEnabled;
          const isToggling = togglingAgent === agent.type;
          const health = agentHealth?.[agent.type];
          const healthStatus = health?.health_status;

          return (
            <div
              key={agent.type}
              className={`glass-panel rounded-xl p-4 space-y-2.5 transition-opacity ${isPaused ? 'opacity-50 border border-muted/30' : healthStatus === 'failing' ? 'border border-destructive/40' : healthStatus === 'degraded' || (stale && !isRunningNow) ? 'border border-amber-400/30' : ''}`}
              title={health ? `24h: ${health.recent_runs_24h} runs${health.recent_failure_rate_pct != null ? `, ${health.recent_failure_rate_pct}% fail` : ''}${health.success_rate_pct != null ? ` · lifetime ${health.success_rate_pct}%` : ''}` : undefined}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${isPaused ? 'bg-muted/30' : 'bg-primary/10'}`}>
                    <Icon className={`h-3.5 w-3.5 ${isPaused ? 'text-muted-foreground' : 'text-primary'}`} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold">{agent.name}</h3>
                    <p className="text-[9px] text-muted-foreground">{agent.schedule}</p>
                  </div>
                </div>
                {isPaused ? (
                  <Badge variant="outline" className="text-[9px] text-muted-foreground border-muted/40">Paused</Badge>
                ) : isRunningNow ? (
                  <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400/30 animate-pulse">Running</Badge>
                ) : healthStatus === 'failing' ? (
                  <Badge variant="outline" className="text-[9px] text-destructive border-destructive/30">Failing</Badge>
                ) : healthStatus === 'degraded' ? (
                  <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400/30">Degraded</Badge>
                ) : healthStatus === 'stale' || stale ? (
                  <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400/30">⚠ Stale</Badge>
                ) : healthStatus === 'never_ran' ? (
                  <Badge variant="outline" className="text-[9px] text-muted-foreground">New</Badge>
                ) : healthStatus === 'healthy' || stats.lastRun?.status === 'completed' ? (
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
                  <p className="text-[10px] font-bold">{agentRuns}</p>
                  <p className="text-[8px] text-muted-foreground">Runs</p>
                </div>
              </div>

              {/* Show the last error message inline so failed agents are
                  actionable without scrolling through the log stream. */}
              {stats.lastError && stats.successRate === 0 && (
                <div className="flex items-start gap-1.5 rounded bg-destructive/10 border border-destructive/20 px-2 py-1.5">
                  <AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                  <p className="text-[9px] text-destructive leading-snug line-clamp-2">{stats.lastError}</p>
                </div>
              )}

              <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                <span>
                  {lastActivityAt ? `Last: ${timeAgo(lastActivityAt)}` : 'Never run'}
                </span>
                {staffReady && <div className="flex items-center gap-1">
                  {/* Pause / Resume toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-5 w-5 p-0 ${isPaused ? 'text-emerald-400 hover:text-emerald-300' : 'text-muted-foreground hover:text-amber-400'}`}
                    disabled={isToggling}
                    title={isPaused ? 'Resume agent' : 'Pause agent'}
                    onClick={() => toggleAgent(agent.type, isEnabled)}
                  >
                    {isToggling
                      ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      : isPaused
                        ? <Play className="h-2.5 w-2.5" />
                        : <Pause className="h-2.5 w-2.5" />
                    }
                  </Button>
                  {/* Run now - disabled if this specific agent is running (local state or DB) */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[9px] px-1.5"
                    disabled={isRunningNow || isPaused}
                    onClick={() => runAgent(agent.name, agent.fn)}
                  >
                    {isRunningNow ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5 mr-0.5" />}
                    Run
                  </Button>
                </div>}
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
