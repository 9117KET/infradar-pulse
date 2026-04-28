import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { agentApi } from '@/lib/api/agents';
import { toast } from 'sonner';
import { Layers, RefreshCw, ChevronDown, ChevronUp, ExternalLink, FileText, Mail, Download, BarChart3, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import jsPDF from 'jspdf';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { applyPdfWatermark, buildWatermarkLabel } from '@/lib/billing/exportCaps';
import { trackUsage } from '@/lib/billing/trackUsage';
import { REGIONS, SECTORS, STAGES } from '@/data/projects';

type DigestSection = { title: string; bullets: string[] };
type DigestCitation = { label: string; url: string };
type DigestPayload = { sections?: DigestSection[]; citations?: DigestCitation[] };
type ReportMetrics = {
  scope?: string;
  report_label?: string;
  project_count?: number;
  total_value_label?: string;
  avg_confidence?: number;
  avg_risk?: number;
  critical_alerts?: number;
  high_risk_projects?: number;
};
type ReportParameters = {
  summary?: string;
  scope_label?: string;
  template?: string;
  citation_count?: number;
  metrics?: ReportMetrics;
};

type SummaryItem = {
  id: string;
  type: 'digest' | 'report';
  title: string;
  summary: string | null;
  markdown: string | null;
  payload: DigestPayload | null;
  parameters?: ReportParameters | null;
  citations?: DigestCitation[];
  read: boolean;
  status: string;
  created_at: string;
  completed_at?: string | null;
};

const REPORT_TYPES = [
  { value: 'country_projects_market', label: 'Country Projects Market' },
  { value: 'sector_pipeline', label: 'Sector Pipeline' },
  { value: 'tender_awards_outlook', label: 'Tender & Awards Outlook' },
  { value: 'portfolio_risk_brief', label: 'Portfolio Risk Brief' },
  { value: 'weekly_market_snapshot', label: 'Market Snapshot' },
];

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, options?: { bold?: boolean; size?: number }) {
  const pageH = doc.internal.pageSize.getHeight();
  const bottom = 22;
  const lineHeight = options?.size ? Math.max(4.4, options.size * 0.42) : 5;
  doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
  doc.setFontSize(options?.size ?? 10);
  const lines = doc.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    if (y + lineHeight > pageH - bottom) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

function exportReportPdf(item: SummaryItem, userEmail: string | null | undefined) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentW = w - margin * 2;
  const metrics = item.parameters?.metrics ?? {};
  const generated = new Date(item.completed_at ?? item.created_at).toLocaleString();

  doc.setFillColor(9, 18, 28);
  doc.rect(0, 0, w, 44, 'F');
  doc.setTextColor(94, 234, 212);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('InfraRadarAI Intelligence Report', margin, 16);
  doc.setTextColor(244, 250, 252);
  doc.setFontSize(18);
  doc.text(doc.splitTextToSize(item.title, contentW), margin, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(190, 200, 210);
  doc.text(`${metrics.scope ?? item.parameters?.scope_label ?? 'Global coverage'} · ${generated}`, margin, 38);

  let y = 56;
  const kpis = [
    ['Projects', String(metrics.project_count ?? '—')],
    ['Pipeline value', metrics.total_value_label ?? '—'],
    ['Avg confidence', metrics.avg_confidence != null ? `${metrics.avg_confidence}%` : '—'],
    ['Critical alerts', String(metrics.critical_alerts ?? '—')],
  ];
  const boxW = (contentW - 9) / 4;
  kpis.forEach(([label, value], i) => {
    const x = margin + i * (boxW + 3);
    doc.setDrawColor(80, 95, 105);
    doc.setFillColor(245, 248, 250);
    doc.roundedRect(x, y, boxW, 20, 2, 2, 'FD');
    doc.setTextColor(30, 42, 52);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(value, x + 3, y + 8);
    doc.setTextColor(95, 105, 115);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(label, x + 3, y + 15);
  });
  y += 32;

  if (item.summary) {
    doc.setTextColor(24, 34, 44);
    y = addWrappedText(doc, 'Executive takeaways', margin, y, contentW, { bold: true, size: 12 }) + 1;
    doc.setTextColor(55, 65, 75);
    y = addWrappedText(doc, item.summary, margin, y, contentW, { size: 10 }) + 5;
  }

  const markdownLines = (item.markdown ?? '').split('\n');
  for (const rawLine of markdownLines) {
    const line = rawLine.trim();
    if (!line) {
      y += 2;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)/);
    if (heading) {
      if (y > 255) {
        doc.addPage();
        y = 20;
      }
      doc.setTextColor(18, 28, 38);
      y = addWrappedText(doc, heading[2], margin, y + 3, contentW, { bold: true, size: heading[1].length === 1 ? 14 : 12 }) + 1;
      continue;
    }
    const bullet = line.replace(/^[-*]\s+/, '• ').replace(/^\d+\.\s+/, '• ');
    doc.setTextColor(55, 65, 75);
    y = addWrappedText(doc, bullet, margin, y, contentW, { size: 9.5 });
  }

  if (item.citations?.length) {
    doc.addPage();
    doc.setTextColor(18, 28, 38);
    y = addWrappedText(doc, 'Source appendix', margin, 20, contentW, { bold: true, size: 14 });
    doc.setTextColor(60, 70, 80);
    item.citations.forEach((c, i) => {
      y = addWrappedText(doc, `${i + 1}. ${c.label}: ${c.url}`, margin, y + 2, contentW, { size: 8.5 });
    });
  }

  applyPdfWatermark(doc, buildWatermarkLabel(userEmail));
  doc.save(`infradar_report_${safeFilename(item.title)}.pdf`);
}

function SummaryCard({ item, onMarkRead, markReadPending, onExportPdf, canExportPdf }: {
  item: SummaryItem;
  onMarkRead?: (id: string) => void;
  markReadPending?: boolean;
  onExportPdf?: (item: SummaryItem) => void;
  canExportPdf?: boolean;
}) {
  const [expanded, setExpanded] = useState(!item.read || item.type === 'report');
  const [dialogOpen, setDialogOpen] = useState(false);

  const sections = item.payload?.sections ?? [];
  const digestCitations = item.payload?.citations ?? [];
  const citations = item.type === 'report' ? (item.citations ?? []) : digestCitations;
  const hasSections = sections.length > 0;
  const hasCitations = citations.length > 0;
  const metrics = item.parameters?.metrics;

  return (
    <div className={`rounded-lg border border-border p-4 space-y-3 ${item.read ? 'opacity-90' : 'bg-primary/[0.03]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={`text-[10px] ${item.type === 'digest' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted'}`}>
              {item.type === 'digest' ? <><Mail className="h-2.5 w-2.5 mr-1" />Digest</> : <><FileText className="h-2.5 w-2.5 mr-1" />Report</>}
            </Badge>
            <h3 className="text-sm font-semibold">{item.title}</h3>
            <Badge variant="outline" className="text-[10px]">{item.status}</Badge>
            {!item.read && item.type === 'digest' && <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30">New</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {item.summary || item.parameters?.summary || (item.type === 'report' ? 'AI-generated market report built from live projects, alerts, updates, and citations.' : '')}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {new Date(item.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!item.read && item.type === 'digest' && onMarkRead && (
            <Button size="sm" variant="outline" onClick={() => onMarkRead(item.id)} disabled={markReadPending}>Mark read</Button>
          )}
          {item.type === 'report' && item.markdown && (
            <>
              <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} className="h-7 text-xs">View</Button>
              <Button size="sm" variant="outline" onClick={() => onExportPdf?.(item)} className="h-7 text-xs" title={!canExportPdf ? 'PDF export requires a paid report export plan' : undefined}>
                <Download className="h-3 w-3 mr-1" /> PDF{!canExportPdf && <span className="ml-1 text-[9px] text-primary">PRO</span>}
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setExpanded(v => !v)} className="h-7 w-7 p-0">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {item.type === 'report' && metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-md border border-border/60 bg-muted/20 p-2"><p className="text-[10px] text-muted-foreground">Projects</p><p className="text-sm font-semibold">{metrics.project_count ?? '—'}</p></div>
          <div className="rounded-md border border-border/60 bg-muted/20 p-2"><p className="text-[10px] text-muted-foreground">Pipeline value</p><p className="text-sm font-semibold">{metrics.total_value_label ?? '—'}</p></div>
          <div className="rounded-md border border-border/60 bg-muted/20 p-2"><p className="text-[10px] text-muted-foreground">Avg risk</p><p className="text-sm font-semibold">{metrics.avg_risk ?? '—'}</p></div>
          <div className="rounded-md border border-border/60 bg-muted/20 p-2"><p className="text-[10px] text-muted-foreground">Sources</p><p className="text-sm font-semibold">{item.parameters?.citation_count ?? citations.length}</p></div>
        </div>
      )}

      {expanded && (
        <div className="space-y-4 pt-1">
          {hasSections ? (
            sections.map((section, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground">{section.title}</p>
                <ul className="space-y-1">
                  {section.bullets.map((bullet, j) => (
                    <li key={j} className="flex gap-2 text-xs text-muted-foreground"><span className="mt-1.5 h-1 w-1 rounded-full bg-primary/60 shrink-0" /> <span>{bullet}</span></li>
                  ))}
                </ul>
              </div>
            ))
          ) : item.markdown ? (
            <div className="prose prose-invert prose-sm max-w-none prose-headings:font-serif prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary rounded-md border border-border/40 bg-muted/10 p-4">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.markdown}</ReactMarkdown>
            </div>
          ) : null}

          {hasCitations && (
            <>
              <Separator className="opacity-40" />
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sources</p>
                <div className="flex flex-wrap gap-2">
                  {citations.slice(0, 12).map((c, i) => (
                    <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                      <ExternalLink className="h-2.5 w-2.5" /> {c.label}
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[86vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-serif">{item.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="prose prose-invert prose-sm max-w-none prose-headings:font-serif prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.markdown ?? ''}</ReactMarkdown>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function IntelligenceSummaries() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { canExportPdf, refresh: refreshEntitlements } = useEntitlements();
  const [filter, setFilter] = useState<'all' | 'digest' | 'report'>('all');
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [reportType, setReportType] = useState('country_projects_market');
  const [country, setCountry] = useState('all');
  const [region, setRegion] = useState('all');
  const [sector, setSector] = useState('all');
  const [stage, setStage] = useState('all');
  const [days, setDays] = useState('30');

  const { data: digests = [], isLoading: digestsLoading } = useQuery({
    queryKey: ['digests'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
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
      const { data, error } = await (supabase as any)
        .from('report_runs')
        .select('id,report_type,status,title,markdown,citations,parameters,created_at,completed_at')
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        type: 'report' as const,
        title: r.title || r.report_type,
        summary: r.parameters?.summary ?? null,
        markdown: r.markdown,
        payload: null,
        parameters: r.parameters ?? null,
        citations: r.citations ?? [],
        read: true,
        status: r.status,
        created_at: r.created_at,
        completed_at: r.completed_at,
      }));
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('digests').update({ read: true }).eq('id', id);
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

  const runReport = useMutation({
    mutationFn: () => agentApi.runReportAgent({
      report_type: reportType,
      days: Number(days),
      country: country === 'all' ? undefined : country,
      region: region === 'all' ? undefined : region,
      sector: sector === 'all' ? undefined : sector,
      stage: stage === 'all' ? undefined : stage,
    }),
    onSuccess: async () => {
      toast.success('Report started');
      await queryClient.invalidateQueries({ queryKey: ['report-runs'] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to run report agent'),
  });

  const handleExportPdf = async (item: SummaryItem) => {
    if (!canExportPdf) {
      setUpgradeOpen(true);
      return;
    }
    exportReportPdf(item, user?.email);
    const result = await trackUsage('export_pdf');
    if (!result.ok) {
      if (result.emailUnverified) toast.error('Confirm your email before exporting');
      else if (result.overLimit) setUpgradeOpen(true);
      toast.error(result.message ?? 'Export limit reached');
      return;
    }
    await refreshEntitlements();
    toast.success('Report downloaded as PDF');
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
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="export" />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" /> Intelligence Summaries
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Living AI briefings and market reports generated from projects, alerts, updates, and verified source links.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && <Badge variant="outline" className="text-xs">{unread} unread</Badge>}
          <Button size="sm" variant="outline" onClick={() => runDigest.mutate()} disabled={runDigest.isPending}>
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            {runDigest.isPending ? 'Running…' : 'Generate Digest'}
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI market report builder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Report type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{REPORT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Region</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All regions</SelectItem>{REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sector</Label>
              <Select value={sector} onValueChange={setSector}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All sectors</SelectItem>{SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All stages</SelectItem>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Window</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="7">7 days</SelectItem><SelectItem value="30">30 days</SelectItem><SelectItem value="90">90 days</SelectItem><SelectItem value="180">180 days</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Country focus</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All countries</SelectItem>
                  {['United Arab Emirates', 'Saudi Arabia', 'Egypt', 'Kenya', 'Nigeria', 'South Africa', 'Morocco', 'India', 'Indonesia', 'Brazil'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => runReport.mutate()} disabled={runReport.isPending} className="teal-glow h-9">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${runReport.isPending ? 'animate-spin' : ''}`} />
              {runReport.isPending ? 'Generating…' : 'Generate Report'}
            </Button>
            <p className="text-xs text-muted-foreground max-w-2xl">
              Reports are built from live platform data, confidence scores, alerts, project changes, and citations so users can ask follow-up questions instead of reading a static one-off PDF.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs value={filter} onValueChange={v => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All ({allItems.length})</TabsTrigger>
          <TabsTrigger value="digest">Digests ({(digests as SummaryItem[]).length})</TabsTrigger>
          <TabsTrigger value="report">Reports ({(reports as SummaryItem[]).length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="glass-panel border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Intelligence inbox</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : allItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No summaries yet. Generate a digest or report to get started.</p>
          ) : (
            <ScrollArea className="h-[620px] pr-2">
              <div className="space-y-3">
                {allItems.map(item => (
                  <SummaryCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                    onMarkRead={id => markRead.mutate(id)}
                    markReadPending={markRead.isPending}
                    onExportPdf={handleExportPdf}
                    canExportPdf={canExportPdf}
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
