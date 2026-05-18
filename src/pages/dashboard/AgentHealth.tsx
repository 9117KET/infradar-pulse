import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Activity, AlertCircle, CheckCircle2, Clock, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { timeAgo } from '@/lib/agents/agentUtils';

interface AgentConfigRow {
  agent_type: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  success_count: number;
  failure_count: number;
  last_duration_ms: number | null;
}

interface TaskRow {
  id: string;
  task_type: string;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

interface MonitoringSummary {
  agent_configs: AgentConfigRow[];
  recent_tasks: TaskRow[];
  totals: { total_runs: number; completed: number; failed: number; running: number };
}

function formatDuration(ms: number | null): string {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function healthBadge(row: AgentConfigRow) {
  if (!row.enabled) return <Badge variant="outline">Paused</Badge>;
  if (row.last_run_status === 'running') return <Badge className="bg-blue-500/15 text-blue-400 hover:bg-blue-500/20">Running</Badge>;
  if (row.last_run_status === 'failed') return <Badge variant="destructive">Failed</Badge>;
  if (row.last_run_status === 'completed') return <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20">Healthy</Badge>;
  return <Badge variant="secondary">Idle</Badge>;
}

export default function AgentHealth() {
  const [search, setSearch] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['agent-health-dashboard'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_agent_monitoring_summary', { p_recent_limit: 400 });
      if (error) throw error;
      return data as MonitoringSummary;
    },
    refetchInterval: 15000,
  });

  const errorsByAgent = useMemo(() => {
    const map: Record<string, TaskRow[]> = {};
    (data?.recent_tasks ?? []).forEach((t) => {
      if (t.status !== 'failed' || !t.error) return;
      (map[t.task_type] ||= []).push(t);
    });
    return map;
  }, [data]);

  const rows = useMemo(() => {
    const configs = data?.agent_configs ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q ? configs.filter((c) => c.agent_type.toLowerCase().includes(q)) : configs;
    return [...filtered].sort((a, b) => {
      // Failed first, then by failure rate, then alphabetic
      const af = a.last_run_status === 'failed' ? 0 : 1;
      const bf = b.last_run_status === 'failed' ? 0 : 1;
      if (af !== bf) return af - bf;
      const ar = a.failure_count / Math.max(a.success_count + a.failure_count, 1);
      const br = b.failure_count / Math.max(b.success_count + b.failure_count, 1);
      if (ar !== br) return br - ar;
      return a.agent_type.localeCompare(b.agent_type);
    });
  }, [data, search]);

  const totals = data?.totals;
  const healthyCount = rows.filter((r) => r.enabled && r.last_run_status === 'completed').length;
  const failedCount = rows.filter((r) => r.last_run_status === 'failed').length;
  const pausedCount = rows.filter((r) => !r.enabled).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif tracking-tight">Agent Health</h1>
          <p className="text-muted-foreground text-sm mt-1">Last run, duration, success/failure counts and recent errors per cron agent.</p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <div>
              <div className="text-2xl font-semibold">{healthyCount}</div>
              <div className="text-xs text-muted-foreground">Healthy</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <div className="text-2xl font-semibold">{failedCount}</div>
              <div className="text-xs text-muted-foreground">Last run failed</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="h-5 w-5 text-blue-400" />
            <div>
              <div className="text-2xl font-semibold">{totals?.running ?? 0}</div>
              <div className="text-xs text-muted-foreground">Running now</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-semibold">{pausedCount}</div>
              <div className="text-xs text-muted-foreground">Paused</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Agents ({rows.length})</CardTitle>
          <Input
            placeholder="Filter agents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">Success</TableHead>
                <TableHead className="text-right">Failures</TableHead>
                <TableHead className="text-right">Success rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No agents found.</TableCell></TableRow>
              )}
              {rows.map((row) => {
                const total = row.success_count + row.failure_count;
                const successRate = total > 0 ? (row.success_count / total) * 100 : null;
                const errors = errorsByAgent[row.agent_type] ?? [];
                const isOpen = openRow === row.agent_type;
                return (
                  <Collapsible key={row.agent_type} open={isOpen} onOpenChange={(o) => setOpenRow(o ? row.agent_type : null)} asChild>
                    <>
                      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => setOpenRow(isOpen ? null : row.agent_type)}>
                        <TableCell>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </CollapsibleTrigger>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.agent_type}</TableCell>
                        <TableCell>{healthBadge(row)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.last_run_at ? timeAgo(row.last_run_at) : 'Never'}</TableCell>
                        <TableCell className="text-sm">{formatDuration(row.last_duration_ms)}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-400">{row.success_count}</TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">{row.failure_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{successRate === null ? '—' : `${successRate.toFixed(1)}%`}</TableCell>
                      </TableRow>
                      <CollapsibleContent asChild>
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/20 p-4">
                            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Recent errors</div>
                            {errors.length === 0 ? (
                              <div className="text-sm text-muted-foreground">No recent failures.</div>
                            ) : (
                              <ul className="space-y-2">
                                {errors.slice(0, 5).map((e) => (
                                  <li key={e.id} className="border border-border/50 rounded-md p-2 bg-background/40">
                                    <div className="text-xs text-muted-foreground mb-1">{timeAgo(e.created_at)}</div>
                                    <div className="text-sm font-mono whitespace-pre-wrap break-words text-destructive/90">{e.error}</div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
