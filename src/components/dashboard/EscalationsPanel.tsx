import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Check, Loader2, Inbox, ExternalLink } from 'lucide-react';

const PAGE_SIZE = 25;

interface EscalationRow {
  id: string;
  process: string;
  reason_code: string;
  detail: string | null;
  severity: string;
  status: string;
  subject_type: string | null;
  subject_id: string | null;
  project_id: string | null;
  occurrences: number | null;
  last_seen_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const severityStyle: Record<string, string> = {
  critical: 'bg-destructive/20 text-destructive',
  high: 'bg-amber-500/20 text-amber-400',
  medium: 'bg-blue-500/20 text-blue-400',
  low: 'bg-muted text-muted-foreground',
};

export function EscalationsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);

  const { data = { rows: [] as EscalationRow[], total: 0 }, isLoading } = useQuery({
    queryKey: ['agent-escalations', page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const { data: rows, error, count } = await (supabase as any)
        .from('agent_escalations')
        .select('*', { count: 'exact' })
        .in('status', ['open', 'acknowledged'])
        .order('severity', { ascending: true })
        .order('last_seen_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (rows ?? []) as EscalationRow[], total: count ?? 0 };
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'resolved' | 'dismissed' }) => {
      const { error } = await (supabase as any).rpc('resolve_escalation', {
        p_id: id,
        p_status: status,
        p_note: status === 'resolved' ? 'Handled by reviewer' : 'Dismissed by reviewer',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-escalations'] });
      toast({ title: 'Escalation closed' });
    },
    onError: (e: any) =>
      toast({ title: 'Could not close this item', description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (data.rows.length === 0) {
    return (
      <div className="glass-panel rounded-xl p-12 text-center">
        <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing needs a human right now. Automated checks raise items here when they refuse to decide on their own.
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      {data.rows.map((row) => (
        <div key={row.id} className="glass-panel rounded-xl p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium">{row.process.replace(/_/g, ' ')}</span>
            <Badge className={severityStyle[row.severity] ?? severityStyle.low}>{row.severity}</Badge>
            <Badge variant="outline">{row.reason_code}</Badge>
            {(row.occurrences ?? 1) > 1 && (
              <span className="text-xs text-muted-foreground">seen {row.occurrences} times</span>
            )}
          </div>
          {row.detail && <p className="text-sm text-muted-foreground">{row.detail}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Last seen {new Date(row.last_seen_at ?? row.created_at).toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              {row.project_id && (
                <Button size="sm" variant="outline" asChild>
                  <a href={`/dashboard/projects/${row.project_id}`}>
                    <ExternalLink className="mr-1 h-3 w-3" /> Open project
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate({ id: row.id, status: 'dismissed' })}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate({ id: row.id, status: 'resolved' })}
              >
                <Check className="mr-1 h-3 w-3" /> Mark handled
              </Button>
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        <span>
          {data.total === 0 ? '0' : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
            Previous
          </Button>
          <span>Page {page + 1} of {totalPages}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page + 1 >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export default EscalationsPanel;
