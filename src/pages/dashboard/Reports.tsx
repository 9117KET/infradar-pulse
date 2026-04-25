import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, RefreshCw, Download } from 'lucide-react';
import { agentApi } from '@/lib/api/agents';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { applyPdfWatermark, buildWatermarkLabel } from '@/lib/billing/exportCaps';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { trackUsage } from '@/lib/billing/trackUsage';
import { useState } from 'react';

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
  const { user } = useAuth();
  const { canExportPdf, plan, refresh: refreshEntitlements } = useEntitlements();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const { data: runs, isLoading, refetch } = useQuery({
    queryKey: ['report-runs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('report_runs')
        .select('id,report_type,status,title,markdown,created_at,completed_at')
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as ReportRun[];
    },
  });

  const downloadReportPdf = async (report: ReportRun) => {
    if (!canExportPdf) {
      setUpgradeOpen(true);
      return;
    }
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentW = pageW - margin * 2;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 30, 40);
    doc.text(report.title || report.report_type, margin, 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 130);
    const created = new Date(report.created_at).toLocaleString();
    const completed = report.completed_at ? ` · Completed ${new Date(report.completed_at).toLocaleString()}` : '';
    doc.text(`${created}${completed}`, margin, 30);

    // Divider
    doc.setDrawColor(200, 200, 210);
    doc.line(margin, 33, pageW - margin, 33);

    // Body - wrap markdown text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 50);
    const body = report.markdown || '';
    const lines = doc.splitTextToSize(body, contentW);
    let y = 40;
    const lineH = 5;
    const pageH = doc.internal.pageSize.getHeight();
    const bottomMargin = 20;
    for (const line of lines) {
      if (y + lineH > pageH - bottomMargin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineH;
    }

    const watermark = buildWatermarkLabel(user?.email);
    applyPdfWatermark(doc, watermark);

    const slug = (report.title || report.report_type).replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    doc.save(`infradar_report_${slug}.pdf`);

    const trackResult = await trackUsage('export_pdf');
    if (!trackResult.ok) {
      if (trackResult.emailUnverified) {
        toast.error('Confirm your email before exporting');
        return;
      }
      if (trackResult.overLimit) setUpgradeOpen(true);
      toast.error(trackResult.message ?? 'Export limit reached');
      return;
    }
    await refreshEntitlements();
    toast.success('Report downloaded as PDF');
  };

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
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="export" />
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
                  {r.markdown && r.status === 'completed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-xs h-7"
                      onClick={() => void downloadReportPdf(r)}
                      title={!canExportPdf ? `PDF export requires the Pro plan` : undefined}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      PDF
                      {!canExportPdf && <span className="ml-1 text-[9px] text-primary">PRO</span>}
                    </Button>
                  )}
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

