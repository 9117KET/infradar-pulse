import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { REGIONS, SECTORS, STAGES } from '@/data/projects';
import { useProjects } from '@/hooks/use-projects';
import { useAlerts } from '@/hooks/use-alerts';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTrackedProjects } from '@/hooks/use-tracked-projects';
import { useSavedSearches } from '@/hooks/use-saved-searches';
import { supabase } from '@/integrations/supabase/client';
import { trackUsage } from '@/lib/billing/trackUsage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, Download, Bookmark, Plus, AlertTriangle, Activity, ShieldCheck, TrendingUp, DollarSign, MapPin, Star, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';
import { canAccessFeature } from '@/lib/billing/featureAccess';
import { applyExportCap, buildCsvHeaderComment, buildWatermarkLabel, downloadXlsx } from '@/lib/billing/exportCaps';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import OverviewMap from '@/components/dashboard/OverviewMap';

const CHART_COLORS = ['#5eead4', '#38bdf8', '#a78bfa', '#fb923c', '#f87171', '#34d399'];
const STATUS_COLORS: Record<string, string> = { Verified: '#22c55e', Stable: '#3b82f6', Pending: '#f59e0b', 'At Risk': '#ef4444' };
const STAGE_COLORS: Record<string, string> = {
  Planned: '#64748b', Tender: '#8b5cf6', Awarded: '#3b82f6', Financing: '#f59e0b',
  Construction: '#22c55e', Completed: '#14b8a6', Cancelled: '#ef4444', Stopped: '#dc2626',
};

const TOOLTIP_STYLE = { background: 'hsl(210 12% 9%)', border: '1px solid hsl(210 10% 18%)', borderRadius: 8, fontSize: 12, color: 'hsl(180 10% 92%)' };
const TOOLTIP_LABEL_STYLE = { color: 'hsl(180 10% 92%)' };
const TOOLTIP_ITEM_STYLE = { color: 'hsl(180 10% 92%)' };

export default function Projects() {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'projects';
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasRole, profile, user } = useAuth();
  const { canExportCsv, plan, staffBypass, refresh: refreshEntitlements } = useEntitlements();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const preferenceFilters = profile?.onboarded
    ? { regions: profile.regions, sectors: profile.sectors, stages: profile.stages }
    : undefined;
  const hasPreferenceFilters =
    !!profile?.onboarded &&
    ((profile.regions?.length ?? 0) > 0 || (profile.sectors?.length ?? 0) > 0 || (profile.stages?.length ?? 0) > 0);
  const { projects, allProjects, loading, truncated, totalAvailable, rowCap } = useProjects(preferenceFilters);
  const { alerts } = useAlerts();
  const [viewScope, setViewScope] = useState<'coverage' | 'all'>('coverage');
  const { isTracked, toggleTrack, trackedProjects } = useTrackedProjects();
  const canCreate = hasRole('admin') || hasRole('researcher');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<string>('all');
  const [sector, setSector] = useState<string>('all');
  const [confFilter, setConfFilter] = useState<string>('all');
  const [recentlyUnverified, setRecentlyUnverified] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from('project_verification_log')
      .select('project_id')
      .eq('action', 'unverified')
      .gte('created_at', sevenDaysAgo)
      .then(({ data, error }) => {
        if (error) { return; }
        if (data) setRecentlyUnverified(new Set(data.map((d: any) => d.project_id)));
      });
  }, []);

  const projectSource = (!hasPreferenceFilters || viewScope === 'all') ? allProjects : projects;

  const filtered = useMemo(() => {
    return projectSource.filter(p => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.country.toLowerCase().includes(search.toLowerCase())) return false;
      if (stage !== 'all' && p.stage !== stage) return false;
      if (sector !== 'all' && p.sector !== sector) return false;
      if (confFilter === 'high' && p.confidence < 90) return false;
      if (confFilter === 'medium' && (p.confidence < 70 || p.confidence >= 90)) return false;
      if (confFilter === 'low' && p.confidence >= 70) return false;
      return true;
    });
  }, [projectSource, search, stage, sector, confFilter]);

  // Aggregations for KPIs + Analytics charts
  const totalValue = useMemo(() => filtered.reduce((s, p) => s + (p.valueUsd || 0), 0), [filtered]);
  const avgConfidence = useMemo(() => filtered.length ? Math.round(filtered.reduce((s, p) => s + p.confidence, 0) / filtered.length) : 0, [filtered]);
  const verifiedCount = useMemo(() => filtered.filter(p => p.status === 'Verified').length, [filtered]);

  const regionData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(p => { map[p.region] = (map[p.region] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const sectorData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(p => { map[p.sector] = (map[p.sector] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const stageData = useMemo(() => {
    const stages = ['Planned', 'Tender', 'Awarded', 'Financing', 'Construction', 'Completed'];
    const map: Record<string, number> = {};
    filtered.forEach(p => { map[p.stage] = (map[p.stage] || 0) + 1; });
    return stages.map(name => ({ name, value: map[name] || 0 }));
  }, [filtered]);

  const statusData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(p => { map[p.status] = (map[p.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const confidenceDistribution = useMemo(() => {
    const buckets = [
      { name: '<50%', min: 0, max: 50, count: 0 },
      { name: '50-69%', min: 50, max: 70, count: 0 },
      { name: '70-89%', min: 70, max: 90, count: 0 },
      { name: '≥90%', min: 90, max: 101, count: 0 },
    ];
    filtered.forEach(p => {
      const b = buckets.find(b => p.confidence >= b.min && p.confidence < b.max);
      if (b) b.count++;
    });
    return buckets.map(b => ({ name: b.name, value: b.count }));
  }, [filtered]);

  const valueByRegion = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(p => { map[p.region] = (map[p.region] || 0) + p.valueUsd; });
    return Object.entries(map).map(([name, value]) => ({ name, value: +(value / 1e9).toFixed(1) }));
  }, [filtered]);

  // ── Risk tab data ────────────────────────────────────────────────
  const riskProjects = useMemo(() => {
    return ((!hasPreferenceFilters || viewScope === 'all') ? allProjects : projects)
      .map(p => {
        const anomalies: string[] = [];
        if (p.riskScore >= 70) anomalies.push('High risk score');
        if (p.confidence < 50) anomalies.push('Low confidence');
        if (p.status === 'At Risk') anomalies.push('At Risk status');
        if (p.stage === 'Stopped' || p.stage === 'Cancelled') anomalies.push(`Project ${p.stage.toLowerCase()}`);
        const projectAlerts = alerts.filter(a => a.projectName === p.name);
        if (projectAlerts.some(a => a.severity === 'critical')) anomalies.push('Critical alert');
        return { ...p, anomalies, alertCount: projectAlerts.length };
      })
      .filter(p => p.anomalies.length > 0 || p.riskScore >= 40)
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [allProjects, projects, alerts, hasPreferenceFilters, viewScope]);

  const riskDistribution = useMemo(() => [
    { label: 'Low (0-24)', count: allProjects.filter(p => p.riskScore < 25).length, color: 'bg-emerald-500' },
    { label: 'Medium (25-49)', count: allProjects.filter(p => p.riskScore >= 25 && p.riskScore < 50).length, color: 'bg-amber-500' },
    { label: 'High (50-74)', count: allProjects.filter(p => p.riskScore >= 50 && p.riskScore < 75).length, color: 'bg-red-500' },
    { label: 'Critical (75+)', count: allProjects.filter(p => p.riskScore >= 75).length, color: 'bg-red-700' },
  ], [allProjects]);

  // ── Analytics tab data ───────────────────────────────────────────
  const sectorValueData = useMemo(() => {
    const map: Record<string, { projects: number; totalValue: number; avgRisk: number }> = {};
    allProjects.forEach(p => {
      if (!map[p.sector]) map[p.sector] = { projects: 0, totalValue: 0, avgRisk: 0 };
      map[p.sector].projects++;
      map[p.sector].totalValue += p.valueUsd || 0;
      map[p.sector].avgRisk = Math.round((map[p.sector].avgRisk * (map[p.sector].projects - 1) + p.riskScore) / map[p.sector].projects);
    });
    return Object.entries(map)
      .map(([sector, d]) => ({ sector, ...d }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [allProjects]);

  const exportCSV = async () => {
    if (!canExportCsv) {
      setUpgradeOpen(true);
      return;
    }
    const capped = applyExportCap(filtered, plan, staffBypass);
    const watermark = buildWatermarkLabel(user?.email);
    const headers = ['Name', 'Country', 'Region', 'Sector', 'Stage', 'Value', 'Confidence', 'Status', 'Last Updated'];
    const rows = capped.rows.map(p => [p.name, p.country, p.region, p.sector, p.stage, p.valueLabel, `${p.confidence}%`, p.status, p.lastUpdated]);
    const preamble = buildCsvHeaderComment(watermark, capped);
    const csv = [...preamble, headers, ...rows].map(r =>
      Array.isArray(r) ? r.map(c => `"${c}"`).join(',') : r,
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'infradar_projects.csv'; a.click();
    URL.revokeObjectURL(url);
    const result = await trackUsage('export_csv');
    if (!result.ok) {
      if (result.emailUnverified) {
        toast({ title: 'Confirm your email', description: result.message, variant: 'destructive' });
        return;
      }
      if (result.overLimit) setUpgradeOpen(true);
      toast({ title: 'Export limit reached', description: result.message, variant: 'destructive' });
      return;
    }
    await refreshEntitlements();
    if (capped.truncated) {
      toast({
        title: 'Export truncated',
        description: `Exported ${capped.rows.length} of ${capped.total} rows. Your ${plan} plan caps each export at ${capped.cap} rows. Upgrade for more.`,
      });
    } else {
      toast({ title: 'Exported', description: `${filtered.length} projects exported to CSV.` });
    }
  };

  const exportXLSX = async () => {
    if (!canExportCsv) {
      setUpgradeOpen(true);
      return;
    }
    const capped = applyExportCap(filtered, plan, staffBypass);
    const watermark = buildWatermarkLabel(user?.email);
    const headers = ['Name', 'Country', 'Region', 'Sector', 'Stage', 'Value', 'Confidence', 'Status', 'Last Updated'];
    const rows = capped.rows.map(p => [p.name, p.country, p.region, p.sector, p.stage, p.valueLabel, `${p.confidence}%`, p.status, p.lastUpdated]);
    downloadXlsx('infradar_projects.xlsx', headers, rows, watermark, capped);
    const result = await trackUsage('export_csv');
    if (!result.ok) {
      if (result.emailUnverified) {
        toast({ title: 'Confirm your email', description: result.message, variant: 'destructive' });
        return;
      }
      if (result.overLimit) setUpgradeOpen(true);
      toast({ title: 'Export limit reached', description: result.message, variant: 'destructive' });
      return;
    }
    await refreshEntitlements();
    if (capped.truncated) {
      toast({
        title: 'Export truncated',
        description: `Exported ${capped.rows.length} of ${capped.total} rows. Your ${plan} plan caps each export at ${capped.cap} rows. Upgrade for more.`,
      });
    } else {
      toast({ title: 'Exported', description: `${filtered.length} projects exported to Excel.` });
    }
  };

  const { saveSearch: saveSearchMutation } = useSavedSearches();
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [saveSearchNotify, setSaveSearchNotify] = useState(false);

  const hasActiveFilters = search || stage !== 'all' || sector !== 'all' || confFilter !== 'all';

  const handleSaveSearch = async () => {
    if (!saveSearchName.trim()) return;
    try {
      await saveSearchMutation.mutateAsync({
        name: saveSearchName.trim(),
        filters: { search, stage, sector, confFilter },
        notifyEmail: saveSearchNotify,
      });
      toast({ title: 'Search saved', description: 'Filters saved. View in Settings.' });
      setSaveSearchOpen(false);
      setSaveSearchName('');
      setSaveSearchNotify(false);
    } catch {
      toast({ title: 'Failed to save search', variant: 'destructive' });
    }
  };

  const viewOnMap = () => {
    const params = new URLSearchParams();
    if (sector !== 'all') params.set('sector', sector);
    navigate(`/dashboard/geo${params.toString() ? '?' + params.toString() : ''}`);
  };

  const [riskPage, setRiskPage] = useState(0);
  const RISK_PAGE_SIZE = 10;
  const [projectPage, setProjectPage] = useState(0);
  const PROJECT_PAGE_SIZE = 25;

  // Reset project page whenever filters change
  useEffect(() => {
    setProjectPage(0);
  }, [search, stage, sector, confFilter, viewScope]);

  return (
    <div className="space-y-4">
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="export" />

      {/* Save Search Dialog */}
      <Dialog open={saveSearchOpen} onOpenChange={setSaveSearchOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Search</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="search-name">Name</Label>
              <Input
                id="search-name"
                placeholder="e.g. MENA Energy Tenders"
                value={saveSearchName}
                onChange={e => setSaveSearchName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSaveSearch(); }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email alerts</p>
                <p className="text-xs text-muted-foreground">Notify me when new projects match</p>
              </div>
              <Switch checked={saveSearchNotify} onCheckedChange={setSaveSearchNotify} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveSearchOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSaveSearch()} disabled={!saveSearchName.trim() || saveSearchMutation.isPending}>
              {saveSearchMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue={activeTab}>
        <div className="-mx-1 overflow-x-auto scrollbar-none">
          <TabsList className="w-max">
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="risk">Risk Signals</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>
        </div>

      {/* ── Analytics Tab ── */}
      <TabsContent value="analytics" className="space-y-6">
        <div>
          <h2 className="text-lg font-bold">Sector Analytics</h2>
          <p className="text-sm text-muted-foreground">Project count, pipeline value, and average risk by sector across all tracked projects.</p>
        </div>
        <div className="glass-panel rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left bg-black/20">
                <th className="p-3 font-medium text-muted-foreground">Sector</th>
                <th className="p-3 font-medium text-muted-foreground text-right">Projects</th>
                <th className="p-3 font-medium text-muted-foreground text-right">Total Value</th>
                <th className="p-3 font-medium text-muted-foreground text-right">Avg Risk</th>
              </tr>
            </thead>
            <tbody>
              {sectorValueData.map(row => (
                <tr key={row.sector} className="border-b border-border/50 hover:bg-white/[0.02]">
                  <td className="p-3 font-medium">{row.sector}</td>
                  <td className="p-3 text-right text-muted-foreground">{row.projects}</td>
                  <td className="p-3 text-right font-medium">
                    {row.totalValue >= 1e9 ? `$${(row.totalValue / 1e9).toFixed(1)}B` : row.totalValue >= 1e6 ? `$${(row.totalValue / 1e6).toFixed(0)}M` : row.totalValue > 0 ? `$${row.totalValue.toLocaleString()}` : '—'}
                  </td>
                  <td className="p-3 text-right">
                    <span className={`font-bold ${row.avgRisk >= 70 ? 'text-red-400' : row.avgRisk >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{row.avgRisk}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="text-lg font-bold">Pipeline & Distribution</h2>
          <p className="text-sm text-muted-foreground">Breakdown of the filtered project set by region, status, confidence, stage, and value.</p>
        </div>

        {/* Region donut + Status donut + Confidence histogram */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-sm font-semibold mb-3">By region</h3>
            {loading ? <Skeleton className="h-[180px] w-full" /> : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={regionData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3} stroke="none">
                      {regionData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-1">
                  {regionData.map((r, i) => (
                    <span key={r.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{r.name}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-sm font-semibold mb-3">By status</h3>
            {loading ? <Skeleton className="h-[180px] w-full" /> : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3} stroke="none">
                      {statusData.map(s => <Cell key={s.name} fill={STATUS_COLORS[s.name] || '#64748b'} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-1">
                  {statusData.map(s => (
                    <span key={s.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[s.name] || '#64748b' }} />{s.name} ({s.value})
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-sm font-semibold mb-3">Confidence distribution</h3>
            {loading ? <Skeleton className="h-[180px] w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={confidenceDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 10% 18%)" />
                  <XAxis dataKey="name" tick={{ fill: 'hsl(210 8% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(210 8% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={28} fill="hsl(170 55% 63%)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Stage bar + Value by region + Sector bar */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-sm font-semibold mb-3">Pipeline by stage</h3>
            {loading ? <Skeleton className="h-[200px] w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stageData} layout="vertical" margin={{ left: 5, right: 15 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fill: 'hsl(210 8% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={14}>
                    {stageData.map(s => <Cell key={s.name} fill={STAGE_COLORS[s.name] || '#64748b'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-sm font-semibold mb-3">Value by region ($B)</h3>
            {loading ? <Skeleton className="h-[200px] w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={valueByRegion}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 10% 18%)" />
                  <XAxis dataKey="name" tick={{ fill: 'hsl(210 8% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(210 8% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} formatter={(v: number) => [`$${v}B`, 'Value']} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={32} fill="#38bdf8" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-sm font-semibold mb-3">By sector</h3>
            {loading ? <Skeleton className="h-[200px] w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sectorData} layout="vertical" margin={{ left: 5, right: 15 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fill: 'hsl(210 8% 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={14}>
                    {sectorData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </TabsContent>

      {/* ── Risk Tab ── */}
      <TabsContent value="risk" className="space-y-6">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-primary" /> Risk & Anomaly Signals</h2>
          <p className="text-sm text-muted-foreground">Projects with high risk scores, low confidence, critical alerts, or anomalous status changes.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { label: 'Avg Risk', value: allProjects.length ? Math.round(allProjects.reduce((s, p) => s + p.riskScore, 0) / allProjects.length) : 0, color: '' },
            { label: 'Critical', value: riskProjects.filter(p => p.riskScore >= 75).length, color: 'text-red-400' },
            { label: 'High', value: riskProjects.filter(p => p.riskScore >= 50 && p.riskScore < 75).length, color: 'text-amber-400' },
            { label: 'Flagged', value: riskProjects.length, color: '' },
          ].map(k => (
            <div key={k.label} className="glass-panel border-border rounded-xl p-4">
              <div className="text-xs text-muted-foreground mb-1">{k.label}</div>
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
        <div className="glass-panel border-border rounded-xl p-4">
          <p className="text-sm font-semibold mb-3">Risk Distribution</p>
          <div className="space-y-2">
            {riskDistribution.map(d => (
              <div key={d.label} className="flex items-center gap-3">
                <span className="w-28 text-xs text-muted-foreground">{d.label}</span>
                <div className="flex-1 h-5 rounded bg-border/30 overflow-hidden">
                  <div className={`h-full rounded ${d.color}`} style={{ width: `${allProjects.length ? (d.count / allProjects.length) * 100 : 0}%` }} />
                </div>
                <span className="text-xs font-medium w-6 text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-panel border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Flagged Projects</p>
            {riskProjects.length > 0 && <span className="text-xs text-muted-foreground">{riskPage * RISK_PAGE_SIZE + 1}–{Math.min((riskPage + 1) * RISK_PAGE_SIZE, riskProjects.length)} of {riskProjects.length}</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left bg-black/20">
                  <th className="p-3 font-medium text-muted-foreground">Project</th>
                  <th className="p-3 font-medium text-muted-foreground">Risk Score</th>
                  <th className="p-3 font-medium text-muted-foreground">Anomalies</th>
                  <th className="p-3 font-medium text-muted-foreground">Alerts</th>
                  <th className="p-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {riskProjects.slice(riskPage * RISK_PAGE_SIZE, (riskPage + 1) * RISK_PAGE_SIZE).map((p: any) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-white/[0.02]">
                    <td className="p-3">
                      <Link to={`/dashboard/projects/${p.id}`} className="text-primary hover:underline font-medium">{p.name}</Link>
                      <div className="text-[10px] text-muted-foreground">{p.country} · {p.region}</div>
                    </td>
                    <td className="p-3">
                      <span className={`font-bold ${p.riskScore >= 75 ? 'text-red-400' : p.riskScore >= 50 ? 'text-amber-400' : 'text-emerald-400'}`}>{p.riskScore}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {p.anomalies.map((a: string) => (
                          <Badge key={a} variant="outline" className="text-[9px] border-red-500/30 text-red-400">{a}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{p.alertCount}</td>
                    <td className="p-3"><Badge variant="outline" className="text-xs">{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {riskProjects.length > RISK_PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <button onClick={() => setRiskPage(p => Math.max(0, p - 1))} disabled={riskPage === 0} className="px-3 py-1 text-xs rounded border border-border disabled:opacity-40 hover:bg-muted">Previous</button>
              <span className="text-xs text-muted-foreground">Page {riskPage + 1} of {Math.ceil(riskProjects.length / RISK_PAGE_SIZE)}</span>
              <button onClick={() => setRiskPage(p => Math.min(Math.ceil(riskProjects.length / RISK_PAGE_SIZE) - 1, p + 1))} disabled={(riskPage + 1) * RISK_PAGE_SIZE >= riskProjects.length} className="px-3 py-1 text-xs rounded border border-border disabled:opacity-40 hover:bg-muted">Next</button>
            </div>
          )}
        </div>
      </TabsContent>

      {/* ── Projects Tab ── */}
      <TabsContent value="projects" className="space-y-6">
      {/* Plan row-cap banner — surfaces when the user's plan limited the dataset they're seeing */}
      {!loading && truncated && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            Showing {rowCap.toLocaleString()} of {totalAvailable.toLocaleString()} projects on your current plan.{' '}
            <Link to="/pricing" className="underline hover:text-amber-400">Upgrade</Link> to load the full pipeline.
          </span>
        </div>
      )}
      {/* Coverage banner */}
      {!loading && (() => {
        const isStaff = hasRole('admin') || hasRole('researcher');
        const isFiltered = hasPreferenceFilters && viewScope === 'coverage' && projects.length < allProjects.length;
        const regionList = profile?.regions?.slice(0, 3).join(', ') ?? '';
        const moreRegions = (profile?.regions?.length ?? 0) > 3 ? ` +${(profile.regions?.length ?? 0) - 3} more` : '';

        if (isStaff) {
          return (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Viewing all {allProjects.length} globally tracked projects.
            </div>
          );
        }
        if (isFiltered) {
          return (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>
                Showing projects in your coverage regions: {regionList}{moreRegions}.{' '}
                <Link to="/dashboard/settings" className="underline hover:text-amber-400">Expand in Settings</Link> to see more.
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-500">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Viewing your full global coverage.
          </div>
        );
      })()}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold">Project discovery & profiling</h1>
          {hasPreferenceFilters && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              The dataset below starts from your onboarding regions, sectors, and stages. Refine further with filters or update preferences in{' '}
              <Link to="/dashboard/settings" className="text-primary hover:underline">Settings</Link>.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPreferenceFilters && (
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              <button
                className={`px-3 py-1.5 transition-colors ${viewScope === 'coverage' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/[0.04]'}`}
                onClick={() => setViewScope('coverage')}
              >
                My coverage
              </button>
              <button
                className={`px-3 py-1.5 transition-colors ${viewScope === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/[0.04]'}`}
                onClick={() => setViewScope('all')}
              >
                All projects
              </button>
            </div>
          )}
          {trackedProjects.length > 0 && (
            <Link to="/dashboard/portfolio">
              <Button size="sm" variant="outline">
                <Star className="h-3 w-3 mr-1 fill-amber-400 text-amber-400" />
                Portfolio ({trackedProjects.length})
              </Button>
            </Link>
          )}
          {canCreate && <Link to="/dashboard/projects/new"><Button size="sm"><Plus className="h-3 w-3 mr-1" />New Project</Button></Link>}
          <Button size="sm" variant="outline" onClick={viewOnMap}><MapPin className="h-3 w-3 mr-1" />View on Map</Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!canAccessFeature(plan, 'saved_searches', staffBypass)) {
                setUpgradeOpen(true);
                return;
              }
              setSaveSearchOpen(true);
            }}
            disabled={!hasActiveFilters}
            title={!canAccessFeature(plan, 'saved_searches', staffBypass) ? 'Saved searches require the Starter plan' : undefined}
          >
            <Bookmark className="h-3 w-3 mr-1" />Save search
            {!canAccessFeature(plan, 'saved_searches', staffBypass) && <span className="ml-1.5 text-[10px] text-primary">PRO</span>}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void exportCSV()} title={!canExportCsv ? 'Opens upgrade options — daily limit reached' : undefined}><Download className="h-3 w-3 mr-1" />Export CSV</Button>
          <Button size="sm" variant="outline" onClick={() => void exportXLSX()} title={!canExportCsv ? 'Opens upgrade options — daily limit reached' : undefined}><Download className="h-3 w-3 mr-1" />Export Excel</Button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
        {[
          { label: 'Total projects', value: filtered.length, icon: Activity, color: 'text-primary' },
          { label: 'Verified', value: verifiedCount, icon: ShieldCheck, color: 'text-emerald-400' },
          { label: 'Avg confidence', value: `${avgConfidence}%`, icon: TrendingUp, color: 'text-primary' },
          { label: 'Total value', value: totalValue >= 1e9 ? `$${(totalValue / 1e9).toFixed(1)}B` : `$${(totalValue / 1e6).toFixed(0)}M`, icon: DollarSign, color: 'text-amber-400' },
          { label: 'Regions', value: regionData.length, icon: MapPin, color: 'text-blue-400' },
          { label: 'At Risk', value: filtered.filter(p => p.status === 'At Risk').length, icon: AlertTriangle, color: 'text-destructive' },
        ].map(k => (
          <div key={k.label} className="glass-panel rounded-xl p-4">
            <k.icon className={`h-4 w-4 ${k.color} mb-2`} />
            {loading ? <Skeleton className="h-7 w-12" /> : <div className="text-xl font-serif font-bold">{k.value}</div>}
            <div className="text-[10px] text-muted-foreground mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-2 sm:gap-3">
        <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects or countries..." className="pl-9 bg-black/20" />
        </div>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-full lg:w-[140px] bg-black/20"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All stages</SelectItem>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sector} onValueChange={setSector}>
          <SelectTrigger className="w-full lg:w-[160px] bg-black/20"><SelectValue placeholder="Sector" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All sectors</SelectItem>{SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={confFilter} onValueChange={setConfFilter}>
          <SelectTrigger className="w-full lg:w-[150px] bg-black/20"><SelectValue placeholder="Confidence" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All confidence</SelectItem>
            <SelectItem value="high">High (≥90%)</SelectItem>
            <SelectItem value="medium">Medium (70–89%)</SelectItem>
            <SelectItem value="low">Low (&lt;70%)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table (md+) / Card list (mobile) */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left bg-black/20">
                <th className="p-3 font-medium text-muted-foreground">Project</th>
                <th className="p-3 font-medium text-muted-foreground w-8"></th>
                <th className="p-3 font-medium text-muted-foreground">Country</th>
                <th className="p-3 font-medium text-muted-foreground">Sector</th>
                <th className="p-3 font-medium text-muted-foreground">Stage</th>
                <th className="p-3 font-medium text-muted-foreground">Value</th>
                <th className="p-3 font-medium text-muted-foreground">Confidence</th>
                <th className="p-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No projects match your filters.</td></tr>
              ) : filtered.slice(projectPage * PROJECT_PAGE_SIZE, (projectPage + 1) * PROJECT_PAGE_SIZE).map(p => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <Link to={`/dashboard/projects/${p.id}`} className="text-primary hover:underline font-medium">{p.name}</Link>
                      {p.dbId && recentlyUnverified.has(p.dbId) && (
                        <span title="Recently marked unverified"><AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" /></span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {p.dbId && (
                      <button onClick={() => toggleTrack(p.dbId!)} title={isTracked(p.dbId) ? 'Untrack' : 'Track'}>
                        <Star className={`h-4 w-4 ${isTracked(p.dbId) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground hover:text-amber-400'}`} />
                      </button>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{p.country}</td>
                  <td className="p-3 text-muted-foreground">{p.sector}</td>
                  <td className="p-3"><Badge variant="outline" className="text-xs">{p.stage}</Badge></td>
                  <td className="p-3 font-medium">{p.valueLabel}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 rounded bg-black/20 overflow-hidden"><div className="h-full rounded bg-primary" style={{ width: `${p.confidence}%` }} /></div>
                      <span className="text-xs">{p.confidence}%</span>
                    </div>
                  </td>
                  <td className="p-3"><Badge variant="outline" className="text-xs">{p.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length > PROJECT_PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {projectPage * PROJECT_PAGE_SIZE + 1}–{Math.min((projectPage + 1) * PROJECT_PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()} projects
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={projectPage === 0} onClick={() => setProjectPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={(projectPage + 1) * PROJECT_PAGE_SIZE >= filtered.length} onClick={() => setProjectPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map preview */}
      {!loading && <OverviewMap projects={filtered} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
