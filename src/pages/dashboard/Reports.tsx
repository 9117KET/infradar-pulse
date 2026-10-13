import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, RefreshCw, Download, Sparkles, Clock3, Link2, CalendarClock, FileSpreadsheet, Save, Calculator, Globe } from 'lucide-react';
import { exportReportXlsx } from './reports/exportReportXlsx';
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

const SECTIONS: Array<[string, string]> = [
  ['executive_summary', 'Executive summary'],
  ['market_overview', 'Market overview'],
  ['pipeline_table', 'Project pipeline table'],
  ['top_projects', 'Top project deep-dives'],
  ['key_players', 'Key players & contractors'],
  ['tender_outlook', 'Tender & award outlook'],
  ['risks', 'Risks & alerts'],
  ['outlook', 'Outlook & actions'],
  ['data_quality', 'Data quality notes'],
];

type Template = { id: string; name: string; report_type: string; parameters: Record<string, unknown> };
type Preview = { matched_projects: number; projects_used: number; ai_reports: number; live_searches: number; words: string; depth_allowed: boolean; live_allowed: boolean; est_minutes: number; warning: string | null };

export default function Reports() {
  const { user } = useAuth();
  const { canExportPdf, plan, refresh: refreshEntitlements } = useEntitlements();
  const { savedSearches } = useSavedSearches();
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
  const [savedSearchId, setSavedSearchId] = useState('none');
  const [generating, setGenerating] = useState(false);
  const [scheduleCadence, setScheduleCadence] = useState('monthly');
  const [sections, setSections] = useState<string[]>(SECTIONS.map(([k]) => k));
  const [liveResearch, setLiveResearch] = useState(false);
  const [valueMin, setValueMin] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const { canExportCsv } = useEntitlements();

  const { data: templates, refetch: refetchTemplates } = useQuery({
    queryKey: ['report-templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('report_templates').select('id,name,report_type,parameters').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const { data: runs, isLoading, refetch } = useQuery({
    queryKey: ['report-runs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('report_runs')
        .select('id,report_type,status,title,markdown,citations,parameters,created_at,completed_at')
        .order('created_at', { ascending: false }).limit(25);
      if (error) throw error;
      return (data ?? []) as ReportRun[];
    },
    refetchInterval: (query) => query.state.data?.some((run) => run.status === 'running') ? 5000 : false,
  });

  const { data: schedules, refetch: refetchSchedules } = useQuery({
    queryKey: ['report-schedules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('report_schedules').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Schedule[];
    },
  });

  const buildOptions = () => ({
    report_type: reportType, depth, days: Number(days) || 30,
    country: country || undefined, region: region || undefined, sector: sector || undefined,
    stage: stage || undefined, question: reportType === 'custom_brief' ? question : undefined,
    tracked_only: trackedOnly, saved_search_id: savedSearchId === 'none' ? undefined : savedSearchId,
    sections, live_research: liveResearch, value_min: Number(valueMin) > 0 ? Number(valueMin) * 1e6 : undefined,
  });

  const toggleSection = (key: string) => { setPreview(null); setSections((cur) => cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]); };

  const runPreview = async () => {
    setPreviewing(true);
    try { setPreview(await agentApi.runReportAgent({ ...buildOptions(), preview: true }) as Preview); }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Could not estimate cost'); }
    finally { setPreviewing(false); }
  };

  const saveTemplate = async () => {
    const name = templateName.trim();
    if (!name) { toast.error('Name your template first'); return; }
    const { error } = await supabase.from('report_templates').insert({ user_id: user?.id as string, name, report_type: reportType, parameters: buildOptions() as never });
    if (error) toast.error(error.message); else { toast.success('Template saved'); setTemplateName(''); await refetchTemplates(); }
  };

  const applyTemplate = (t: Template) => {
    const p = t.parameters as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    setReportType(t.report_type); setDepth((p.depth as typeof depth) ?? 'standard'); setDays(String(p.days ?? 30));
    setCountry(str(p.country)); setRegion(str(p.region)); setSector(str(p.sector)); setStage(str(p.stage)); setQuestion(str(p.question));
    setTrackedOnly(p.tracked_only === true); setSavedSearchId(str(p.saved_search_id) || 'none');
    setSections(Array.isArray(p.sections) && p.sections.length ? p.sections as string[] : SECTIONS.map(([k]) => k));
    setLiveResearch(p.live_research === true); setValueMin(Number(p.value_min) > 0 ? String(Number(p.value_min) / 1e6) : '');
    setPreview(null); toast.success(`Loaded “${t.name}”`);
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from('report_templates').delete().eq('id', id);
    if (error) toast.error(error.message); else await refetchTemplates();
  };

  const downloadReportXlsx = async (report: ReportRun) => {
    if (!canExportCsv) { setUpgradeOpen(true); return; }
    const result = await trackUsage('export_csv');
    if (!result.ok) { toast.error(result.message ?? 'Export limit reached'); return; }
    await exportReportXlsx(report, buildWatermarkLabel(user?.email));
    await refreshEntitlements(); toast.success('Report downloaded as Excel');
  };

  const runReport = async () => {
    if (reportType === 'custom_brief' && !question.trim()) { toast.error('Add a question for your custom brief'); return; }
    if (!sections.length) { toast.error('Pick at least one section'); return; }
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
    const { error } = await supabase.from('report_schedules').insert({
      user_id: user?.id, name: `${REPORT_TYPES.find(([id]) => id === reportType)?.[1] ?? 'Intelligence brief'} · ${scheduleCadence}`,
      report_type: reportType, parameters: buildOptions(), cadence: scheduleCadence,
      next_run_at: new Date(Date.now() + (scheduleCadence === 'weekly' ? 7 : 30) * 86400000).toISOString(),
    });
    if (error) toast.error(error.message); else { toast.success('Report schedule saved'); await refetchSchedules(); }
  };

  const deleteSchedule = async (id: string) => {
    const { error } = await supabase.from('report_schedules').delete().eq('id', id);
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Report type</label><Select value={reportType} onValueChange={setReportType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{REPORT_TYPES.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Depth</label><Select value={depth} onValueChange={(v) => setDepth(v as typeof depth)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="brief">Brief · 700–1,200 words</SelectItem><SelectItem value="standard">Standard · 1,800–3,000 words</SelectItem><SelectItem value="deep">Deep dive · Pro</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Lookback window</label><Input type="number" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} /></div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Saved scope</label><Select value={savedSearchId} onValueChange={setSavedSearchId}><SelectTrigger><SelectValue placeholder="No saved scope" /></SelectTrigger><SelectContent><SelectItem value="none">No saved scope</SelectItem>{savedSearches.map((search) => <SelectItem key={search.id} value={search.id}>{search.name}</SelectItem>)}</SelectContent></Select></div>
        <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" checked={trackedOnly} onChange={(e) => setTrackedOnly(e.target.checked)} className="accent-primary" /> My tracked projects only</label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} /><Input placeholder="Region" value={region} onChange={(e) => setRegion(e.target.value)} /><Input placeholder="Sector" value={sector} onChange={(e) => setSector(e.target.value)} /><Input placeholder="Stage" value={stage} onChange={(e) => setStage(e.target.value)} /></div>
      <div className="space-y-2"><label className="text-xs text-muted-foreground">Sections</label><div className="flex flex-wrap gap-2">{SECTIONS.map(([k, label]) => <button key={k} type="button" onClick={() => toggleSection(k)} className={`rounded-full border px-3 py-1 text-xs transition-colors ${sections.includes(k) ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{label}</button>)}</div></div>
      <div className="grid gap-4 sm:grid-cols-2 items-end">
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Minimum project value (USD millions)</label><Input type="number" min="0" placeholder="Any" value={valueMin} onChange={(e) => { setValueMin(e.target.value); setPreview(null); }} /></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={liveResearch} onChange={(e) => { setLiveResearch(e.target.checked); setPreview(null); }} className="accent-primary mt-1" /><span><Globe className="inline h-3.5 w-3.5 mr-1 text-primary" />Add fresh web research<span className="block text-xs text-muted-foreground">Searches the web now for the latest news, awards and new projects. Paid plans.</span></span></label>
      </div>
      {preview && <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
        <p className="font-medium text-foreground">Cost preview</p>
        <p>Uses <strong>{preview.ai_reports}</strong> AI report from your plan{preview.live_searches ? <> plus <strong>{preview.live_searches}</strong> web searches</> : null}. About {preview.est_minutes} min, {preview.words}.</p>
        <p>{preview.matched_projects.toLocaleString()} matching projects; the report draws on the top {preview.projects_used.toLocaleString()} by value.</p>
        {!preview.depth_allowed && <p className="text-destructive">This depth needs a higher plan.</p>}
        {liveResearch && !preview.live_allowed && <p className="text-destructive">Fresh web research needs a paid plan; the report will use platform data only.</p>}
        {preview.warning && <p className="text-destructive">{preview.warning}</p>}
      </div>}
      {reportType === 'custom_brief' && <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should the intelligence team investigate?" className="min-h-24" />}
      <div className="flex items-center justify-between gap-3 flex-wrap"><p className="text-xs text-muted-foreground">Reports use platform projects, alerts, changes, confidence scores, and cited sources.</p><div className="flex gap-2 flex-wrap"><Button variant="outline" onClick={() => void runPreview()} disabled={previewing}><Calculator className="h-4 w-4 mr-2" />{previewing ? 'Estimating…' : 'Preview cost'}</Button><Button onClick={() => void runReport()} disabled={generating}><RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />{generating ? 'Generating…' : 'Generate intelligence'}</Button></div></div>
      <div className="flex items-center gap-2 flex-wrap border-t border-border pt-4"><Input className="max-w-xs" placeholder="Template name, e.g. Gulf AI data centres" value={templateName} onChange={(e) => setTemplateName(e.target.value)} /><Button variant="outline" onClick={() => void saveTemplate()}><Save className="h-4 w-4 mr-2" />Save as template</Button></div>
      {templates?.length ? <div className="flex flex-wrap gap-2">{templates.map((t) => <span key={t.id} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"><button type="button" className="hover:text-primary" onClick={() => applyTemplate(t)}>{t.name}</button><button type="button" aria-label={`Delete ${t.name}`} className="text-muted-foreground hover:text-destructive" onClick={() => void deleteTemplate(t.id)}>×</button></span>)}</div> : null}
    </CardContent></Card>

    <Card className="glass-panel border-border"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> Keep me informed</CardTitle></CardHeader><CardContent><div className="flex items-center gap-3 flex-wrap"><Select value={scheduleCadence} onValueChange={setScheduleCadence}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select><Button variant="outline" onClick={() => void saveSchedule()}>Schedule this brief</Button><span className="text-xs text-muted-foreground">Uses the current report scope and filters.</span></div>{schedules?.map((s) => <div key={s.id} className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm"><span>{s.name}</span><Button variant="ghost" size="sm" onClick={() => void deleteSchedule(s.id)}>Remove</Button></div>)}</CardContent></Card>

    <Card className="glass-panel border-border"><CardHeader><CardTitle className="text-sm">Your intelligence briefs</CardTitle></CardHeader><CardContent className="space-y-3">{isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : !runs?.length ? <div className="text-sm text-muted-foreground">No reports yet. Build your first brief above.</div> : runs.map((r) => <div key={r.id} className="rounded-lg border border-border p-4 space-y-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="text-sm font-semibold truncate">{r.title || r.report_type}</h3><Badge variant="outline" className="text-[10px]">{r.status}</Badge></div><p className="text-[10px] text-muted-foreground mt-1"><Clock3 className="inline h-3 w-3 mr-1" />{new Date(r.created_at).toLocaleString()}</p></div>{r.markdown && r.status === 'completed' && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void shareReport(r.id)} title="Copy share link"><Link2 className="h-3 w-3" /></Button><Button size="sm" variant="outline" onClick={() => void downloadReportPdf(r)}><Download className="h-3 w-3 mr-1" />PDF</Button><Button size="sm" variant="outline" onClick={() => void downloadReportXlsx(r)}><FileSpreadsheet className="h-3 w-3 mr-1" />Excel</Button></div>}</div>{r.markdown && <pre className="whitespace-pre-wrap text-xs text-muted-foreground bg-muted/20 rounded-md p-3 border border-border/40">{r.markdown}</pre>}{r.citations?.length ? <p className="text-[10px] text-muted-foreground">{r.citations.length} cited sources included</p> : null}</div>)}</CardContent></Card>
  </div>;
}
