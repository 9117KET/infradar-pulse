import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, RefreshCw } from 'lucide-react';
import { agentApi } from '@/lib/api/agents';
import { toast } from 'sonner';

type ReportRun = {
  id: string;
  report_type: string;
  status: string;
  title: string | null;
  markdown: string | null;
  created_at: string;
  completed_at: string | null;
};

export default function Reports() {
  const { data: runs, isLoading, refetch } = useQuery({
    queryKey: ['report-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_runs')
        .select('id,report_type,status,title,markdown,created_at,completed_at')
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as ReportRun[];
    },
  });

  const runReport = async () => {
    try {
      await agentApi.runReportAgent({ report_type: 'weekly_market_snapshot', days: 7 });
      toast.success('Report started');
      await refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to run report agent';
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scheduled and on-demand briefs (stored as Markdown + citations).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void runReport()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Generate report
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Report history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !runs || runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No reports yet.</div>
          ) : (
            runs.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold truncate">{r.title || r.report_type}</h3>
                      <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(r.created_at).toLocaleString()}
                      {r.completed_at ? ` · completed ${new Date(r.completed_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                </div>
                {r.markdown && (
                  <pre className="whitespace-pre-wrap text-xs text-muted-foreground bg-muted/20 rounded-md p-3 border border-border/40">
                    {r.markdown}
                  </pre>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

