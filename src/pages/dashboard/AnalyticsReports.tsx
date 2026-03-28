import { useState, useMemo } from 'react';
import { useProjects } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, FileText, Download, Loader2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

const SECTOR_COLORS = [
  'hsl(var(--primary))', 'hsl(210, 60%, 55%)', 'hsl(40, 80%, 55%)',
  'hsl(280, 50%, 55%)', 'hsl(160, 50%, 45%)', 'hsl(350, 60%, 55%)',
];

export default function AnalyticsReports() {
  const { projects, loading } = useProjects();
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [exportingCsv, setExportingCsv] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

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

  // Region breakdown
  const regionData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(p => { map[p.region] = (map[p.region] || 0) + 1; });
    return Object.entries(map).map(([name, count]) => ({ name, count }));
  }, [filtered]);

  // Confidence distribution
  const confBuckets = useMemo(() => [
    { range: '<60%', count: filtered.filter(p => p.confidence < 60).length },
    { range: '60-69%', count: filtered.filter(p => p.confidence >= 60 && p.confidence < 70).length },
    { range: '70-79%', count: filtered.filter(p => p.confidence >= 70 && p.confidence < 80).length },
    { range: '80-89%', count: filtered.filter(p => p.confidence >= 80 && p.confidence < 90).length },
    { range: '90%+', count: filtered.filter(p => p.confidence >= 90).length },
  ], [filtered]);

  // Stage distribution
  const stageData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(p => { map[p.stage] = (map[p.stage] || 0) + 1; });
    return Object.entries(map).map(([name, count]) => ({ name, count }));
  }, [filtered]);

  const totalValue = filtered.reduce((s, p) => s + p.valueUsd, 0);
  const avgConf = filtered.length ? Math.round(filtered.reduce((s, p) => s + p.confidence, 0) / filtered.length) : 0;
  const avgRisk = filtered.length ? Math.round(filtered.reduce((s, p) => s + p.riskScore, 0) / filtered.length) : 0;

  const exportCsv = () => {
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
      toast.success(`Exported ${filtered.length} projects to CSV`);
    } finally {
      setExportingCsv(false);
    }
  };

  const generateExecutiveReport = async () => {
    setGeneratingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-insight', {
        body: { topic: `Executive briefing: Infrastructure pipeline summary for ${regionFilter === 'all' ? 'MENA and Africa' : regionFilter} covering ${filtered.length} active projects, key risk factors, and investment outlook.` },
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
          <Button onClick={exportCsv} disabled={exportingCsv} size="sm" variant="outline">
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            {exportingCsv ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button onClick={generateExecutiveReport} disabled={generatingReport} size="sm" className="teal-glow">
            {generatingReport ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Generating…</> : <><FileText className="h-3.5 w-3.5 mr-1.5" />Executive Report</>}
          </Button>
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

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sector Donut */}
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pipeline by Sector</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={sectorData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                  {sectorData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => `$${(v / 1e9).toFixed(1)}B`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {sectorData.map(s => (
                <div key={s.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: s.fill }} />
                  <span className="text-muted-foreground">{s.name}</span>
                  <span className="font-medium">{s.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Region Bar */}
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Projects by Region</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={regionData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Confidence Distribution */}
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Confidence Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={confBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="hsl(160, 50%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Stage Distribution */}
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Projects by Stage</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stageData} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={75} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="hsl(210, 60%, 55%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

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
