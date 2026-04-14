import { useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProjects } from '@/hooks/use-projects';
import { useAlerts } from '@/hooks/use-alerts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ArrowLeft, Flag, AlertTriangle, DollarSign, TrendingUp, ShieldCheck } from 'lucide-react';

// Flag map (same as Countries.tsx, keeping minimal here)
const FLAG_MAP: Record<string, string> = {
  'Saudi Arabia': '🇸🇦', 'UAE': '🇦🇪', 'United Arab Emirates': '🇦🇪', 'Egypt': '🇪🇬',
  'Kenya': '🇰🇪', 'Nigeria': '🇳🇬', 'Ghana': '🇬🇭', 'Ethiopia': '🇪🇹',
  'South Africa': '🇿🇦', 'Tanzania': '🇹🇿', 'Uganda': '🇺🇬', 'Mozambique': '🇲🇿',
  'Morocco': '🇲🇦', 'Algeria': '🇩🇿', 'Tunisia': '🇹🇳', 'India': '🇮🇳',
  'Indonesia': '🇮🇩', 'Vietnam': '🇻🇳', 'Philippines': '🇵🇭', 'Thailand': '🇹🇭',
  'Malaysia': '🇲🇾', 'China': '🇨🇳', 'Brazil': '🇧🇷', 'Colombia': '🇨🇴',
  'Mexico': '🇲🇽', 'Kazakhstan': '🇰🇿', 'Pakistan': '🇵🇰', 'Bangladesh': '🇧🇩',
  'Iraq': '🇮🇶', 'Angola': '🇦🇴', 'Zambia': '🇿🇲', 'Zimbabwe': '🇿🇼',
};

const STAGE_COLORS: Record<string, string> = {
  Planned: '#64748b', Tender: '#8b5cf6', Awarded: '#3b82f6', Financing: '#f59e0b',
  Construction: '#22c55e', Completed: '#14b8a6', Cancelled: '#ef4444', Stopped: '#dc2626',
};
const CHART_COLORS = ['#5eead4', '#38bdf8', '#a78bfa', '#fb923c', '#f87171', '#34d399', '#fbbf24', '#a3e635'];
const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-destructive border-destructive/30',
  high: 'text-amber-500 border-amber-500/30',
  medium: 'text-blue-400 border-blue-400/30',
  low: 'text-muted-foreground border-border',
};
const TOOLTIP_STYLE = { background: 'hsl(210 12% 9%)', border: '1px solid hsl(210 10% 18%)', borderRadius: 8, fontSize: 12, color: 'hsl(180 10% 92%)' };

function unslugify(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function CountryDetail() {
  const { country: countrySlug } = useParams<{ country: string }>();
  const navigate = useNavigate();
  const { allProjects, loading } = useProjects();
  const { alerts } = useAlerts();

  const countryName = unslugify(countrySlug ?? '');

  const countryProjects = useMemo(
    () => allProjects.filter(p => p.country.toLowerCase() === countryName.toLowerCase()),
    [allProjects, countryName],
  );

  const countryAlerts = useMemo(() => {
    const names = new Set(countryProjects.map(p => p.name.trim().toLowerCase()));
    return alerts.filter(a => names.has((a.projectName || '').trim().toLowerCase()));
  }, [alerts, countryProjects]);

  const totalValue = countryProjects.reduce((s, p) => s + (p.value || 0), 0);
  const avgRisk = countryProjects.length
    ? Math.round(countryProjects.reduce((s, p) => s + p.riskScore, 0) / countryProjects.length)
    : 0;
  const avgConf = countryProjects.length
    ? Math.round(countryProjects.reduce((s, p) => s + p.confidence, 0) / countryProjects.length)
    : 0;

  const stageData = useMemo(() => {
    const map: Record<string, number> = {};
    countryProjects.forEach(p => { map[p.stage] = (map[p.stage] || 0) + 1; });
    return Object.entries(map).map(([stage, count]) => ({ stage, count, fill: STAGE_COLORS[stage] || '#64748b' }));
  }, [countryProjects]);

  const sectorData = useMemo(() => {
    const map: Record<string, number> = {};
    countryProjects.forEach(p => { map[p.sector] = (map[p.sector] || 0) + 1; });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [countryProjects]);

  const flag = FLAG_MAP[countryName] || '🌍';

  if (!loading && countryProjects.length === 0) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/countries')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> All Countries
        </Button>
        <p className="text-muted-foreground">No projects found for "{countryName}".</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/countries')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> All Countries
        </Button>
      </div>

      {/* Country hero */}
      <div className="flex items-center gap-4">
        <span className="text-5xl">{flag}</span>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flag className="h-5 w-5 text-primary" /> {countryName}
          </h1>
          <p className="text-sm text-muted-foreground">{countryProjects[0]?.region} · {countryProjects.length} projects tracked</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />Total Value</div>
            <CardTitle className="text-2xl">
              {totalValue >= 1e9 ? `$${(totalValue / 1e9).toFixed(1)}B` : totalValue >= 1e6 ? `$${(totalValue / 1e6).toFixed(0)}M` : totalValue > 0 ? `$${totalValue.toLocaleString()}` : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />Avg Risk</div>
            <CardTitle className={`text-2xl ${avgRisk >= 70 ? 'text-red-400' : avgRisk >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{avgRisk}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Avg Confidence</div>
            <CardTitle className="text-2xl">{avgConf}%</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Active Alerts</div>
            <CardTitle className={`text-2xl ${countryAlerts.filter(a => !a.read).length > 0 ? 'text-amber-400' : ''}`}>
              {countryAlerts.filter(a => !a.read).length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-panel border-border">
          <CardHeader><CardTitle className="text-sm">Pipeline by Stage</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stageData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stageData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border">
          <CardHeader><CardTitle className="text-sm">Sector Breakdown</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={sectorData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" paddingAngle={2}>
                  {sectorData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center">
              {sectorData.map(s => (
                <span key={s.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.fill }} />
                  {s.name} ({s.value})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert feed */}
      {countryAlerts.length > 0 && (
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" />Recent Alerts</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {countryAlerts.slice(0, 8).map(a => (
                <div key={a.id} className="flex items-start gap-3 py-1.5 border-b border-border/30 last:border-0">
                  <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-destructive' : a.severity === 'high' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">{a.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className={`text-[9px] ${SEVERITY_COLORS[a.severity] ?? ''}`}>{a.severity}</Badge>
                      <span className="text-[10px] text-muted-foreground">{a.projectName} · {a.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project list */}
      <Card className="glass-panel border-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Projects in {countryName}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>Project</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Sector</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {countryProjects.map(p => (
                <TableRow key={p.id} className="border-border/50">
                  <TableCell>
                    <Link to={`/dashboard/projects/${p.id}`} className="text-primary hover:underline font-medium text-sm">{p.name}</Link>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{p.stage}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.sector}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.value >= 1e9 ? `$${(p.value / 1e9).toFixed(1)}B` : p.value >= 1e6 ? `$${(p.value / 1e6).toFixed(0)}M` : p.value > 0 ? `$${p.value.toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm font-bold ${p.riskScore >= 70 ? 'text-red-400' : p.riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{p.riskScore}</span>
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
