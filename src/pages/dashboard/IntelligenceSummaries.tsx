import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { agentApi } from '@/lib/api/agents';
import { toast } from 'sonner';
import { Layers, RefreshCw, ChevronDown, ChevronUp, ExternalLink, FileText, Mail } from 'lucide-react';

type DigestSection = { title: string; bullets: string[] };
type DigestCitation = { label: string; url: string };
type DigestPayload = { sections?: DigestSection[]; citations?: DigestCitation[] };

type SummaryItem = {
  id: string;
  type: 'digest' | 'report';
  title: string;
  summary: string | null;
  markdown: string | null;
  payload: DigestPayload | null;
  read: boolean;
  status: string;
  created_at: string;
};

function SummaryCard({ item, onMarkRead, markReadPending }: {
  item: SummaryItem;
  onMarkRead?: (id: string) => void;
  markReadPending?: boolean;
}) {
  const [expanded, setExpanded] = useState(!item.read);

  const sections = item.payload?.sections ?? [];
  const citations = item.payload?.citations ?? [];
  const hasSections = sections.length > 0;
  const hasCitations = citations.length > 0;

  return (
    <div className={`rounded-lg border border-border p-4 space-y-3 ${item.read ? 'opacity-75' : 'bg-primary/[0.03]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={`text-[10px] ${item.type === 'digest' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted'}`}>
              {item.type === 'digest' ? <><Mail className="h-2.5 w-2.5 mr-1" />Digest</> : <><FileText className="h-2.5 w-2.5 mr-1" />Report</>}
            </Badge>
            <h3 className="text-sm font-semibold">{item.title}</h3>
            <Badge variant="outline" className="text-[10px]">{item.status}</Badge>
            {!item.read && item.type === 'digest' && (
              <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30">New</Badge>
            )}
          </div>
          {item.summary && (
            <p className="text-xs text-muted-foreground mt-1">{item.summary}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            {new Date(item.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!item.read && item.type === 'digest' && onMarkRead && (
            <Button size="sm" variant="outline" onClick={() => onMarkRead(item.id)} disabled={markReadPending}>
              Mark read
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setExpanded(v => !v)} className="h-7 w-7 p-0">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 pt-1">
          {hasSections ? (
            sections.map((section, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground">{section.title}</p>
                <ul className="space-y-1">
                  {section.bullets.map((bullet, j) => (
                    <li key={j} className="flex gap-2 text-xs text-muted-foreground">
                      <span className="mt-1.5 h-1 w-1 rounded-full bg-primary/60 shrink-0" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : item.markdown ? (
            <pre className="whitespace-pre-wrap text-xs text-muted-foreground bg-muted/20 rounded-md p-3 border border-border/40">
              {item.markdown}
            </pre>
          ) : null}

          {hasCitations && (
            <>
              <Separator className="opacity-40" />
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sources</p>
                <div className="flex flex-wrap gap-2">
                  {citations.map((c, i) => (
                    <a
                      key={i}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      {c.label}
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function IntelligenceSummaries() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'digest' | 'report'>('all');

  const { data: digests = [], isLoading: digestsLoading } = useQuery({
    queryKey: ['digests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('digests')
        .select('id,title,summary,markdown,payload,read,status,created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((d: any) => ({ ...d, type: 'digest' as const }));
    },
  });

  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ['report-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_runs')
        .select('id,report_type,status,title,markdown,created_at,completed_at')
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        type: 'report' as const,
        title: r.title || r.report_type,
        summary: null,
        markdown: r.markdown,
        payload: null,
        read: true,
        status: r.status,
        created_at: r.created_at,
      }));
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('digests').update({ read: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['digests'] }),
  });

  const runDigest = useMutation({
    mutationFn: () => agentApi.runDigestAgent(),
    onSuccess: async () => {
      toast.success('Digest started');
      await queryClient.invalidateQueries({ queryKey: ['digests'] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to run digest agent'),
  });

  const runReport = async () => {
    try {
      await agentApi.runReportAgent({ report_type: 'weekly_market_snapshot', days: 7 });
      toast.success('Report started');
      await queryClient.invalidateQueries({ queryKey: ['report-runs'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to run report agent');
    }
  };

  const allItems: SummaryItem[] = useMemo(() => {
    const merged = [...digests, ...reports] as SummaryItem[];
    return merged
      .filter(item => filter === 'all' || item.type === filter)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [digests, reports, filter]);

  const unread = (digests as SummaryItem[]).filter(d => !d.read).length;
  const isLoading = digestsLoading || reportsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" /> Intelligence Summaries
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated briefings — digests from alerts & tracked projects, plus scheduled market reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && <Badge variant="outline" className="text-xs">{unread} unread</Badge>}
          <Button size="sm" variant="outline" onClick={() => runDigest.mutate()} disabled={runDigest.isPending}>
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            {runDigest.isPending ? 'Running…' : 'Generate Digest'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void runReport()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Generate Report
          </Button>
        </div>
      </div>

      <Tabs value={filter} onValueChange={v => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All ({allItems.length})</TabsTrigger>
          <TabsTrigger value="digest">Digests ({(digests as SummaryItem[]).length})</TabsTrigger>
          <TabsTrigger value="report">Reports ({(reports as SummaryItem[]).length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="glass-panel border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Inbox</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : allItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No summaries yet. Generate a digest or report to get started.
            </p>
          ) : (
            <ScrollArea className="h-[580px] pr-2">
              <div className="space-y-3">
                {allItems.map(item => (
                  <SummaryCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                    onMarkRead={id => markRead.mutate(id)}
                    markReadPending={markRead.isPending}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
