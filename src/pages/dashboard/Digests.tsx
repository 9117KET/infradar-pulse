import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { agentApi } from '@/lib/api/agents';
import { toast } from 'sonner';
import { Mail, RefreshCw, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

type DigestSection = { title: string; bullets: string[] };
type DigestCitation = { label: string; url: string };
type DigestPayload = { sections?: DigestSection[]; citations?: DigestCitation[] };

type DigestRow = {
  id: string;
  title: string;
  summary: string | null;
  markdown: string | null;
  payload: DigestPayload | null;
  read: boolean;
  status: string;
  created_at: string;
};

function DigestCard({ d, onMarkRead, markReadPending }: {
  d: DigestRow;
  onMarkRead: (id: string) => void;
  markReadPending: boolean;
}) {
  const [expanded, setExpanded] = useState(!d.read);

  const sections = d.payload?.sections ?? [];
  const citations = d.payload?.citations ?? [];
  const hasSections = sections.length > 0;
  const hasCitations = citations.length > 0;

  return (
    <div className={`rounded-lg border border-border p-4 space-y-3 ${d.read ? 'opacity-75' : 'bg-primary/[0.03]'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">{d.title}</h3>
            <Badge variant="outline" className="text-[10px]">{d.status}</Badge>
            {!d.read && (
              <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30">New</Badge>
            )}
          </div>
          {d.summary && (
            <p className="text-xs text-muted-foreground mt-1">{d.summary}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            {new Date(d.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!d.read && (
            <Button size="sm" variant="outline" onClick={() => onMarkRead(d.id)} disabled={markReadPending}>
              Mark read
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)} className="h-7 w-7 p-0">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="space-y-4 pt-1">
          {hasSections ? (
            <>
              {sections.map((section, i) => (
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
              ))}
            </>
          ) : d.markdown ? (
            <pre className="whitespace-pre-wrap text-xs text-muted-foreground bg-muted/20 rounded-md p-3 border border-border/40">
              {d.markdown}
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

export default function Digests() {
  const queryClient = useQueryClient();

  const { data: digests, isLoading } = useQuery({
    queryKey: ['digests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('digests')
        .select('id,title,summary,markdown,payload,read,status,created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as DigestRow[];
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('digests').update({ read: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['digests'] });
    },
  });

  const runDigest = useMutation({
    mutationFn: async () => {
      await agentApi.runDigestAgent();
    },
    onSuccess: async () => {
      toast.success('Digest started');
      await queryClient.invalidateQueries({ queryKey: ['digests'] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Failed to run digest agent';
      toast.error(msg);
    },
  });

  const unread = useMemo(() => (digests ?? []).filter((d) => !d.read).length, [digests]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Digests
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated intelligence briefings from alerts, updates, and your tracked projects.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {unread} unread
          </Badge>
          <Button size="sm" variant="outline" onClick={() => runDigest.mutate()} disabled={runDigest.isPending}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            {runDigest.isPending ? 'Running…' : 'Generate digest'}
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Inbox</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !digests || digests.length === 0 ? (
            <div className="text-sm text-muted-foreground">No digests yet. Generate one to get started.</div>
          ) : (
            <ScrollArea className="h-[520px] pr-2">
              <div className="space-y-3">
                {digests.map((d) => (
                  <DigestCard
                    key={d.id}
                    d={d}
                    onMarkRead={(id) => markRead.mutate(id)}
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
