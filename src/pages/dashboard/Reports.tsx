import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, RefreshCw, Download, Sparkles, Clock3, Link2, CalendarClock } from 'lucide-react';
import { agentApi } from '@/lib/api/agents';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { applyPdfWatermark, buildWatermarkLabel } from '@/lib/billing/exportCaps';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useSavedSearches } from '@/hooks/use-saved-searches';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { trackUsage } from '@/lib/billing/trackUsage';
import { useState } from 'react';

type ReportRun = {
  id: string; report_type: string; status: string; title: string | null; markdown: string | null;
  citations?: Array<{ label: string; url: string }> | null; parameters?: Record<string, unknown> | null;
  created_at: string; completed_at: string | null;
};

type Schedule = { id: string; name: string; report_type: string; parameters: Record<string, unknown>; cadence: string; enabled: boolean; next_run_at: string };

const REPORT_TYPES = [
  ['weekly_market_snapshot', 'Weekly market snapshot'],
  ['country_projects_market', 'Country projects market'],
  ['sector_pipeline', 'Sector pipeline'],
  ['tender_awards_outlook', 'Tender & awards outlook'],
  ['portfolio_risk_brief', 'Portfolio risk brief'],
  ['custom_brief', 'Custom intelligence brief'],
];

export default function Reports() {
  const { user } = useAuth();
  const { canExportPdf, plan, refresh: refreshEntitlements } = useEntitlements();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [reportType, setReportType] = useState('weekly_market_snapshot');
  const [depth, setDepth] = useState<'brief' | 'standard' | 'deep'>('standard');
  const [days, setDays] = useState('30');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [sector, setSector] = useState('');
  const [stage, setStage] = useState('');
  const [question, setQuestion] = useState('');
  const [trackedOnly, setTrackedOnly] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [scheduleCadence, setScheduleCadence] = useState('monthly');

  const { data: runs, isLoading, refetch } = useQuery({
    queryKey: ['report-runs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('report_runs')
        .select('id,report_type,status,title,markdown,citations,parameters,created_at,completed_at')
        .order('created_at', { ascending: false }).limit(25);
      if (error) throw error;
      return (data ?? []) as ReportRun[];
    },
  });

  const { data: schedules, refetch: refetchSchedules } = useQuery({
    queryKey: ['report-schedules'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('report_schedules').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Schedule[];
    },
  });

  const buildOptions = () => ({
    report_type: reportType, depth, days: Number(days) || 30,
    country: country || undefined, region: region || undefined, sector: sector || undefined,
    stage: stage || undefined, question: reportType === 'custom_brief' ? question : undefined,
    tracked_only: trackedOnly,
  });

  const runReport = async () => {
    if (reportType === 'custom_brief' && !question.trim()) { toast.error('Add a question for your custom brief'); return; }
    setGenerating(true);
    try {
      await agentApi.runReportAgent(buildOptions());
      toast.success('Report generation started');
      await refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to run report agent');
    } finally { setGenerating(false); }
  };

  const saveSchedule = async () => {
    const { error } = await (supabase as any).from('report_schedules').insert({
      user_id: user?.id, name: `${REPORT_TYPES.find(([id]) => id === reportType)?.[1] ?? 'Intelligence brief'} · ${scheduleCadence}`,
      report_type: reportType, parameters: buildOptions(), cadence: scheduleCadence,
      next_run_at: new Date(Date.now() + (scheduleCadence === 'weekly' ? 7 : 30) * 86400000).toISOString(),
    });
    if (error) toast.error(error.message); else { toast.success('Report schedule saved'); await refetchSchedules(); }
  };

  const deleteSchedule = async (id: string) => {
    const { error } = await (supabase as any).from('report_schedules').delete().eq('id', id);
    if (error) toast.error(error.message); else await refetchSchedules();
  };

  const shareReport = async (id: string) => {
    const { data, error } = await (supabase.rpc as any)('create_report_share', { p_report_run_id: id });
    if (error) toast.error(error.message); else {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${data}`);
      toast.success('Share link copied');
    }
  };

  const downloadReportPdf = async (report: ReportRun) => {
    if (!canExportPdf) { setUpgradeOpen(true); return; }
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth(); const margin = 15; const pageH = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(30, 30, 40);
    doc.text(report.title || report.report_type, margin, 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 120, 130);
    doc.text(`${new Date(report.created_at).toLocaleString()} · InfradarAI intelligence brief`, margin, 30);
    doc.setDrawColor(200, 200, 210); doc.line(margin, 33, pageW - margin, 33);
    doc.setFontSize(10); doc.setTextColor(40, 40, 50);
    const lines = doc.splitTextToSize(report.markdown || '', pageW - margin * 2); let y = 40;
    for (const line of lines) { if (y + 5 > pageH - 20) { doc.addPage(); y = margin; } doc.text(line, margin, y); y += 5; }
    if (report.citations?.length) {
      if (y + 15 > pageH - 20) { doc.addPage(); y = margin; }
      doc.setFont('helvetica', 'bold'); doc.text('Sources', margin, y + 8); doc.setFont('helvetica', 'normal');
      report.citations.forEach((citation, index) => { y += 5; const sourceLines = doc.splitTextToSize(`[${index + 1}] ${citation.label}: ${citation.url}`, pageW - margin * 2); sourceLines.forEach((line: string) => { if (y + 5 > pageH - 20) { doc.addPage(); y = margin; } doc.text(line, margin, y); y += 5; }); });
    }
    applyPdfWatermark(doc, buildWatermarkLabel(user?.email));
    doc.save(`infradar_report_${(report.title || report.report_type).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.pdf`);
    const result = await trackUsage('export_pdf');
    if (!result.ok) { toast.error(result.message ?? 'Export limit reached'); return; }
    await refreshEntitlements(); toast.success('Report downloaded as PDF');
  };

  return <div className="space-y-6">
    <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="export" />
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Report Studio</h1><p className="text-sm text-muted-foreground mt-1">Build evidence-led intelligence briefs around the markets, sectors, and projects you care about.</p></div>
      <Badge variant="outline" className="text-xs">{plan === 'free' ? 'Preview access' : `${plan} intelligence`}</Badge>
    </div>

    <Card className="glass-panel border-border"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Build a report</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Report type</label><Select value={reportType} onValueChange={setReportType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{REPORT_TYPES.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Depth</label><Select value={depth} onValueChange={(v) => setDepth(v as typeof depth)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="brief">Brief · 700–1,200 words</SelectItem><SelectItem value="standard">Standard · 1,800–3,000 words</SelectItem><SelectItem value="deep">Deep dive · Pro</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Lookback window</label><Input type="number" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" checked={trackedOnly} onChange={(e) => setTrackedOnly(e.target.checked)} className="accent-primary" /> My tracked projects only</label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} /><Input placeholder="Region" value={region} onChange={(e) => setRegion(e.target.value)} /><Input placeholder="Sector" value={sector} onChange={(e) => setSector(e.target.value)} /><Input placeholder="Stage" value={stage} onChange={(e) => setStage(e.target.value)} /></div>
      {reportType === 'custom_brief' && <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should the intelligence team investigate?" className="min-h-24" />}
      <div className="flex items-center justify-between gap-3 flex-wrap"><p className="text-xs text-muted-foreground">Reports use platform projects, alerts, changes, confidence scores, and cited sources.</p><Button onClick={() => void runReport()} disabled={generating}><RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />{generating ? 'Generating…' : 'Generate intelligence'}</Button></div>
    </CardContent></Card>

    <Card className="glass-panel border-border"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> Keep me informed</CardTitle></CardHeader><CardContent><div className="flex items-center gap-3 flex-wrap"><Select value={scheduleCadence} onValueChange={setScheduleCadence}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select><Button variant="outline" onClick={() => void saveSchedule()}>Schedule this brief</Button><span className="text-xs text-muted-foreground">Uses the current report scope and filters.</span></div>{schedules?.map((s) => <div key={s.id} className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm"><span>{s.name}</span><Button variant="ghost" size="sm" onClick={() => void deleteSchedule(s.id)}>Remove</Button></div>)}</CardContent></Card>

    <Card className="glass-panel border-border"><CardHeader><CardTitle className="text-sm">Your intelligence briefs</CardTitle></CardHeader><CardContent className="space-y-3">{isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : !runs?.length ? <div className="text-sm text-muted-foreground">No reports yet. Build your first brief above.</div> : runs.map((r) => <div key={r.id} className="rounded-lg border border-border p-4 space-y-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="text-sm font-semibold truncate">{r.title || r.report_type}</h3><Badge variant="outline" className="text-[10px]">{r.status}</Badge></div><p className="text-[10px] text-muted-foreground mt-1"><Clock3 className="inline h-3 w-3 mr-1" />{new Date(r.created_at).toLocaleString()}</p></div>{r.markdown && r.status === 'completed' && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void shareReport(r.id)} title="Copy share link"><Link2 className="h-3 w-3" /></Button><Button size="sm" variant="outline" onClick={() => void downloadReportPdf(r)}><Download className="h-3 w-3 mr-1" />PDF</Button></div>}</div>{r.markdown && <pre className="whitespace-pre-wrap text-xs text-muted-foreground bg-muted/20 rounded-md p-3 border border-border/40">{r.markdown}</pre>}{r.citations?.length ? <p className="text-[10px] text-muted-foreground">{r.citations.length} cited sources included</p> : null}</div>)}</CardContent></Card>
  </div>;
}
