import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { agentApi } from '@/lib/api/agents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Award, Gavel, AlertTriangle, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const EVENT_TYPE_REGEX = /^Contract:\s*(award|tender_open|cancellation|re_tender|dispute|arbitration)\s*—\s*/i;

const EVENT_TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  award:        { label: 'Award',        color: 'text-emerald-400 border-emerald-400/30', icon: <Award className="h-3 w-3" /> },
  tender_open:  { label: 'Tender Open',  color: 'text-blue-400 border-blue-400/30',    icon: <Gavel className="h-3 w-3" /> },
  cancellation: { label: 'Cancellation', color: 'text-red-400 border-red-400/30',      icon: <XCircle className="h-3 w-3" /> },
  re_tender:    { label: 'Re-Tender',    color: 'text-amber-400 border-amber-400/30',  icon: <RefreshCw className="h-3 w-3" /> },
  dispute:      { label: 'Dispute',      color: 'text-orange-400 border-orange-400/30', icon: <AlertTriangle className="h-3 w-3" /> },
  arbitration:  { label: 'Arbitration',  color: 'text-purple-400 border-purple-400/30', icon: <Gavel className="h-3 w-3" /> },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-destructive border-destructive/30',
  high: 'text-amber-500 border-amber-500/30',
  medium: 'text-blue-400 border-blue-400/30',
  low: 'text-muted-foreground border-border',
};

type TenderEvent = {
  id: string;
  eventType: string;
  projectName: string;
  projectId: string | null;
  severity: string;
  summary: string;
  sourceUrl: string | null;
  created_at: string;
};

function parseEventType(message: string): string {
  const m = message.match(EVENT_TYPE_REGEX);
  return m ? m[1].toLowerCase() : 'award';
}

function parseSummary(message: string): string {
  return message.replace(EVENT_TYPE_REGEX, '').trim();
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

const FILTER_TYPES = ['all', 'award', 'tender_open', 'cancellation', 're_tender', 'dispute', 'arbitration'] as const;

export default function Tenders() {
  const { hasRole } = useAuth();
  const canTrigger = hasRole('researcher') || hasRole('admin');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [running, setRunning] = useState(false);

  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ['tender-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('id, project_id, project_name, message, severity, source_url, created_at')
        .eq('category', 'construction')
        .ilike('message', 'Contract: %')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((row: any): TenderEvent => ({
        id: row.id,
        eventType: parseEventType(row.message),
        projectName: row.project_name || 'Unknown project',
        projectId: row.project_id ?? null,
        severity: row.severity,
        summary: parseSummary(row.message),
        sourceUrl: row.source_url ?? null,
        created_at: row.created_at,
      }));
    },
  });

  const { data: monthCounts = { total: 0, award: 0, dispute: 0, arbitration: 0, cancellation: 0 } } = useQuery({
    queryKey: ['tender-events-month-counts'],
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const base = () => supabase
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('category', 'construction')
        .gte('created_at', monthStart.toISOString());

      const [total, award, dispute, arbitration, cancellation] = await Promise.all([
        base().ilike('message', 'Contract: %'),
        base().ilike('message', 'Contract: award —%'),
        base().ilike('message', 'Contract: dispute —%'),
        base().ilike('message', 'Contract: arbitration —%'),
        base().ilike('message', 'Contract: cancellation —%'),
      ]);

      return {
        total: total.count || 0,
        award: award.count || 0,
        dispute: dispute.count || 0,
        arbitration: arbitration.count || 0,
        cancellation: cancellation.count || 0,
      };
    },
  });

  const filtered = useMemo(() =>
    typeFilter === 'all' ? events : events.filter(e => e.eventType === typeFilter),
    [events, typeFilter],
  );

  const awardsCount = monthCounts.award;
  const disputesCount = monthCounts.dispute + monthCounts.arbitration;
  const cancellationsCount = monthCounts.cancellation;

  const handleRun = async () => {
    setRunning(true);
    try {
      await agentApi.runTenderAwardMonitor();
      toast.success('Tender monitor started');
      await refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to run tender monitor');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gavel className="h-5 w-5 text-primary" /> Tenders & Awards
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Contract awards, active tenders, disputes, and cancellations across tracked projects.
          </p>
        </div>
        {canTrigger && (
          <Button size="sm" variant="outline" onClick={() => void handleRun()} disabled={running}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Running…' : 'Run Tender Monitor'}
          </Button>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-1">
            <div className="text-xs text-muted-foreground">Events This Month</div>
            <CardTitle className="text-2xl">{monthCounts.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Award className="h-3 w-3 text-emerald-400" />Awards</div>
            <CardTitle className="text-2xl text-emerald-400">{awardsCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-orange-400" />Disputes</div>
            <CardTitle className="text-2xl text-orange-400">{disputesCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><XCircle className="h-3 w-3 text-red-400" />Cancellations</div>
            <CardTitle className="text-2xl text-red-400">{cancellationsCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Type filter bar */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_TYPES.map(t => {
          const meta = t === 'all' ? null : EVENT_TYPE_META[t];
          const count = t === 'all' ? events.length : events.filter(e => e.eventType === t).length;
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                typeFilter === t ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {meta?.label ?? 'All'} ({count})
            </button>
          );
        })}
      </div>

      {/* Events table */}
      <Card className="glass-panel border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Gavel className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No tender events found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {canTrigger ? 'Run the Tender Monitor to pull the latest data.' : 'Tender data is updated automatically by the monitoring pipeline.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Event</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(event => {
                  const meta = EVENT_TYPE_META[event.eventType] ?? EVENT_TYPE_META['award'];
                  return (
                    <TableRow key={event.id} className="border-border/50">
                      <TableCell>
                        <Badge variant="outline" className={`text-xs flex items-center gap-1 w-fit ${meta.color}`}>
                          {meta.icon}
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{event.projectName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${SEVERITY_COLORS[event.severity] ?? ''}`}>
                          {event.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                        {event.summary}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(event.created_at)}
                      </TableCell>
                      <TableCell>
                        {event.sourceUrl && (
                          <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
