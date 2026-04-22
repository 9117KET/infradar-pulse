import { useState, useMemo } from 'react';
import { useProjects } from '@/hooks/use-projects';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, FileText, Loader2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { trackUsage } from '@/lib/billing/trackUsage';
import { Skeleton } from '@/components/ui/skeleton';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';

const SECTOR_COLORS = [
  'hsl(var(--primary))', 'hsl(210, 60%, 55%)', 'hsl(40, 80%, 55%)',
  'hsl(280, 50%, 55%)', 'hsl(160, 50%, 45%)', 'hsl(350, 60%, 55%)',
];

export default function AnalyticsReports() {
  const { profile, hasRole } = useAuth();
  const isStaff = hasRole('admin') || hasRole('researcher');
  const filters = profile?.onboarded ? { regions: profile.regions, sectors: profile.sectors, stages: profile.stages } : undefined;
  const { projects, loading } = useProjects(filters);
  const { canExportCsv, canUseAi, refresh: refreshEntitlements } = useEntitlements();
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [exportingCsv, setExportingCsv] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'ai' | 'export'>('ai');

  const filtered = regionFilter === 'all' ? projects : projects.filter(p => p.region === regionFilter);
  const regions = [...new Set(projects.map(p => p.region))];

  // Sector breakdown
  const sectorData = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    filtered.forEach(p => {
      if (!map[p.sector]) map[p.sector] = { count: 0, value: 0 };
      map[p.sector].count++;
      map[p.sector].value += p.valueUsd;
    });
    return Object.entries(map).map(([name, d], i) => ({
      name, count: d.count, value: d.value, fill: SECTOR_COLORS[i % SECTOR_COLORS.length],
    })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const totalValue = filtered.reduce((s, p) => s + p.valueUsd, 0);
  const avgConf = filtered.length ? Math.round(filtered.reduce((s, p) => s + p.confidence, 0) / filtered.length) : 0;
  const avgRisk = filtered.length ? Math.round(filtered.reduce((s, p) => s + p.riskScore, 0) / filtered.length) : 0;

  const exportCsv = async () => {
    if (!canExportCsv) {
      setUpgradeReason('export');
      setUpgradeOpen(true);
      return;
    }
    setExportingCsv(true);
    try {
      const headers = ['Name', 'Country', 'Region', 'Sector', 'Stage', 'Status', 'Value (USD)', 'Confidence %', 'Risk Score', 'Last Updated'];
      const rows = filtered.map(p => [
        p.name, p.country, p.region, p.sector, p.stage, p.status,
        p.valueUsd.toString(), p.confidence.toString(), p.riskScore.toString(), p.lastUpdated,
      ]);
      const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `infraradar-projects-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      const result = await trackUsage('export_csv');
      if (!result.ok) {
        toast.error(result.overLimit ? `Export limit reached. ${result.message}` : result.message);
        return;
      }
      await refreshEntitlements();
      toast.success(`Exported ${filtered.length} projects to CSV`);
    } finally {
      setExportingCsv(false);
    }
  };

  const generateExecutiveReport = async () => {
    if (!canUseAi) {
      toast.error('Daily AI generation limit reached. Upgrade on Pricing or try again tomorrow.');
      return;
    }
    setGeneratingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-insight', {
        body: { topic: `Executive briefing: Infrastructure pipeline summary for ${regionFilter === 'all' ? 'all 14 global regions' : regionFilter} covering ${filtered.length} active projects, key risk factors, and investment outlook.` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Executive report generated! Check Insights to review and publish.');
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" /> Analytics & Reports
        </h1>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason={upgradeReason} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" /> Analytics & Reports
        </h1>
        <div className="flex items-center gap-2">
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => void exportCsv()} disabled={exportingCsv} size="sm" variant="outline">
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            {exportingCsv ? 'Exporting…' : 'Export CSV'}
          </Button>
          {isStaff && (
            <Button onClick={generateExecutiveReport} disabled={generatingReport} size="sm" className="teal-glow">
              {generatingReport ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Generating…</> : <><FileText className="h-3.5 w-3.5 mr-1.5" />Executive Report</>}
            </Button>
          )}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">Projects</div>
            <CardTitle className="text-2xl">{filtered.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">Total Value</div>
            <CardTitle className="text-2xl">${(totalValue / 1e9).toFixed(1)}B</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">Avg Confidence</div>
            <CardTitle className="text-2xl">{avgConf}%</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">Avg Risk</div>
            <CardTitle className="text-2xl">{avgRisk}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Value by Sector */}
      <Card className="glass-panel border-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Investment Value by Sector</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>Sector</TableHead>
                <TableHead className="text-right">Projects</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead className="text-right">Avg Value</TableHead>
                <TableHead className="text-right">Avg Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sectorData.map((s, i) => (
                <TableRow key={s.name} className="border-border/50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                      {s.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{s.count}</TableCell>
                  <TableCell className="text-right font-medium">${(s.value / 1e9).toFixed(1)}B</TableCell>
                  <TableCell className="text-right text-muted-foreground">${(s.value / s.count / 1e6).toFixed(0)}M</TableCell>
                  <TableCell className="text-right">
                    <span className={
                      filtered.filter(p => p.sector === s.name).reduce((acc, p) => acc + p.confidence, 0) / s.count >= 80
                        ? 'text-emerald-400' : 'text-amber-400'
                    }>
                      {Math.round(filtered.filter(p => p.sector === s.name).reduce((acc, p) => acc + p.confidence, 0) / s.count)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Project Table */}
      <Card className="glass-panel border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Project Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>Project</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Sector</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id} className="border-border/50">
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.region}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{p.sector}</Badge></TableCell>
                  <TableCell>{p.valueLabel}</TableCell>
                  <TableCell>
                    <span className={p.confidence >= 80 ? 'text-emerald-400' : p.confidence >= 60 ? 'text-amber-400' : 'text-red-400'}>
                      {p.confidence}%
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={p.riskScore >= 50 ? 'text-red-400' : p.riskScore >= 25 ? 'text-amber-400' : 'text-emerald-400'}>
                      {p.riskScore}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      {p.evidence.slice(0, 3).map(e => (
                        <Badge key={e.id} variant="outline" className={`text-[9px] ${e.verified ? 'border-emerald-500/30 text-emerald-400' : 'border-border'}`}>
                          {e.type}
                        </Badge>
                      ))}
                      {p.evidence.length > 3 && <span className="text-[9px] text-muted-foreground">+{p.evidence.length - 3}</span>}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{p.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
