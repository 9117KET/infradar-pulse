import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bot, CheckCircle, XCircle, Clock, RefreshCw, Search, ShieldAlert, Users, DollarSign, Scale, MessageSquare, Package, TrendingUp, Loader2, Radio } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { agentApi } from '@/lib/api/agents';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

const AGENTS = [
  { type: 'discovery', name: 'Research Agent', icon: Search, schedule: 'Every 30 min', fn: agentApi.runResearchAgent },
  { type: 'update-check', name: 'Update Checker', icon: RefreshCw, schedule: 'Every 2 hours', fn: agentApi.runUpdateChecker },
  { type: 'risk-scoring', name: 'Risk Scorer', icon: ShieldAlert, schedule: 'Every 4 hours', fn: agentApi.runRiskScorer },
  { type: 'stakeholder-intel', name: 'Stakeholder Intel', icon: Users, schedule: 'Every 6 hours', fn: agentApi.runStakeholderIntel },
  { type: 'funding-tracker', name: 'Funding Tracker', icon: DollarSign, schedule: 'Every 4 hours', fn: agentApi.runFundingTracker },
  { type: 'regulatory-monitor', name: 'Regulatory Monitor', icon: Scale, schedule: 'Every 3 hours', fn: agentApi.runRegulatoryMonitor },
  { type: 'sentiment-analyzer', name: 'Sentiment Analyzer', icon: MessageSquare, schedule: 'Every 2 hours', fn: agentApi.runSentimentAnalyzer },
  { type: 'supply-chain-monitor', name: 'Supply Chain', icon: Package, schedule: 'Every 4 hours', fn: agentApi.runSupplyChainMonitor },
  { type: 'market-intel', name: 'Market Intel', icon: TrendingUp, schedule: 'Every 6 hours', fn: agentApi.runMarketIntel },
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

export default function AgentMonitoring() {
  const { toast } = useToast();
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
        .limit(200);
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Seed live logs from initial query
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'research_tasks' },
        (payload) => {
          const record = (payload.new as LogEntry);
          if (!record?.id) return;

          setLiveLogs(prev => {
            const exists = prev.findIndex(l => l.id === record.id);
            if (exists >= 0) {
              const updated = [...prev];
              updated[exists] = record;
              return updated;
            }
            return [...prev.slice(-99), record];
          });
          refetch();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isStreaming, refetch]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveLogs]);

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

  const runAgent = async (name: string, fn: () => Promise<any>) => {
    setRunningAgent(name);
    try {
      await fn();
      toast({ title: `${name} triggered` });
      refetch();
    } catch (e: any) {
      toast({ title: `${name} failed`, description: e.message, variant: 'destructive' });
    } finally {
      setRunningAgent(null);
    }
  };

  const totalRuns = tasks?.length || 0;
  const totalCompleted = tasks?.filter(t => t.status === 'completed').length || 0;
  const totalFailed = tasks?.filter(t => t.status === 'failed').length || 0;
  const totalRunning = tasks?.filter(t => t.status === 'running').length || 0;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" /> Agent Monitoring
        </h1>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
      </div>

      {/* Agent grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map(agent => {
          const stats = getAgentStats(agent.type);
          const Icon = agent.icon;
          const isRunning = runningAgent === agent.name || stats.running > 0;

          return (
            <div key={agent.type} className="glass-panel rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{agent.name}</h3>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" /> {agent.schedule}
                    </p>
                  </div>
                </div>
                {isRunning ? (
                  <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/30 animate-pulse">Running</Badge>
                ) : stats.lastRun?.status === 'completed' ? (
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30">Active</Badge>
                ) : stats.lastRun?.status === 'failed' ? (
                  <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">Error</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Idle</Badge>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-background/50 py-1.5">
                  <p className="text-xs font-bold text-emerald-400">{stats.completed}</p>
                  <p className="text-[9px] text-muted-foreground">Success</p>
                </div>
                <div className="rounded-lg bg-background/50 py-1.5">
                  <p className="text-xs font-bold text-destructive">{stats.failed}</p>
                  <p className="text-[9px] text-muted-foreground">Failed</p>
                </div>
                <div className="rounded-lg bg-background/50 py-1.5">
                  <p className="text-xs font-bold">{stats.successRate !== null ? `${stats.successRate}%` : '—'}</p>
                  <p className="text-[9px] text-muted-foreground">Rate</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  {stats.lastRun ? (
                    <>
                      {stats.lastRun.status === 'completed' ? <CheckCircle className="h-2.5 w-2.5 text-emerald-400" /> : stats.lastRun.status === 'failed' ? <XCircle className="h-2.5 w-2.5 text-destructive" /> : <Clock className="h-2.5 w-2.5" />}
                      Last: {timeAgo(stats.lastRun.created_at)}
                    </>
                  ) : 'Never run'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  disabled={!!runningAgent}
                  onClick={() => runAgent(agent.name, agent.fn)}
                >
                  {runningAgent === agent.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Run
                </Button>
              </div>

              {stats.lastRun?.error && (
                <p className="text-[10px] text-destructive bg-destructive/5 rounded px-2 py-1 truncate">{stats.lastRun.error}</p>
              )}
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
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setIsStreaming(!isStreaming)}
            >
              {isStreaming ? 'Pause' : 'Resume'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setLiveLogs([])}
            >
              Clear
            </Button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="h-64 overflow-y-auto rounded-lg bg-background/80 border border-border font-mono text-[11px] p-3 space-y-0.5"
        >
          {liveLogs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Waiting for agent activity…</p>
          ) : (
            liveLogs.map((log) => (
              <div key={log.id}>
                <div
                  className="flex items-start gap-2 py-0.5 hover:bg-muted/30 rounded px-1 cursor-pointer"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  {getStatusIcon(log.status)}
                  <span className="text-muted-foreground shrink-0">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                  <span className="text-primary font-medium shrink-0">
                    [{agentNameMap[log.task_type] || log.task_type}]
                  </span>
                  <span className={getStatusColor(log.status)}>
                    {log.status.toUpperCase()}
                  </span>
                  <span className="text-foreground truncate flex-1">
                    {log.error ? `Error: ${log.error}` : log.query}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {expandedLog === log.id ? '▼' : '▶'}
                  </span>
                </div>
                {expandedLog === log.id && (
                  <div className="ml-5 my-1 p-3 rounded-lg bg-muted/20 border border-border space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                      <div><span className="text-muted-foreground">Task Type:</span> <span className="text-foreground">{log.task_type}</span></div>
                      <div><span className="text-muted-foreground">Status:</span> <span className={getStatusColor(log.status)}>{log.status}</span></div>
                      <div><span className="text-muted-foreground">Created:</span> <span className="text-foreground">{new Date(log.created_at).toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground">Completed:</span> <span className="text-foreground">{log.completed_at ? new Date(log.completed_at).toLocaleString() : '—'}</span></div>
                      <div className="col-span-2"><span className="text-muted-foreground">Query:</span> <span className="text-foreground">{log.query}</span></div>
                      {log.error && (
                        <div className="col-span-2"><span className="text-muted-foreground">Error:</span> <span className="text-destructive">{log.error}</span></div>
                      )}
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
