import { useMemo } from 'react';
import { useProjects } from '@/hooks/use-projects';
import { useAlerts } from '@/hooks/use-alerts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, TrendingUp, TrendingDown, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function RiskAnomalySignals() {
  const { projects, loading } = useProjects();
  const { alerts } = useAlerts();

  const riskProjects = useMemo(() => {
    return projects
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
  }, [projects, alerts]);

  const criticalCount = riskProjects.filter(p => p.riskScore >= 75).length;
  const highCount = riskProjects.filter(p => p.riskScore >= 50 && p.riskScore < 75).length;
  const avgRisk = projects.length ? Math.round(projects.reduce((s, p) => s + p.riskScore, 0) / projects.length) : 0;

  // Risk distribution for chart
  const distribution = [
    { label: 'Low (0-24)', count: projects.filter(p => p.riskScore < 25).length, color: 'bg-emerald-500' },
    { label: 'Medium (25-49)', count: projects.filter(p => p.riskScore >= 25 && p.riskScore < 50).length, color: 'bg-amber-500' },
    { label: 'High (50-74)', count: projects.filter(p => p.riskScore >= 50 && p.riskScore < 75).length, color: 'bg-red-500' },
    { label: 'Critical (75+)', count: projects.filter(p => p.riskScore >= 75).length, color: 'bg-red-700' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-primary" /> Risk & Anomaly Signals
      </h1>
      <p className="text-sm text-muted-foreground">Automated detection of cost overruns, timeline drift, political risk factors, and supply chain disruptions.</p>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">Average Risk</div>
            <CardTitle className="text-2xl">{avgRisk}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-red-500" />Critical</div>
            <CardTitle className="text-2xl text-red-400">{criticalCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-400" />High</div>
            <CardTitle className="text-2xl text-amber-400">{highCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">Flagged Projects</div>
            <CardTitle className="text-2xl">{riskProjects.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Risk distribution */}
      <Card className="glass-panel border-border">
        <CardHeader><CardTitle className="text-base">Risk Distribution</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {distribution.map(d => (
              <div key={d.label} className="flex items-center gap-3">
                <span className="w-28 text-xs text-muted-foreground">{d.label}</span>
                <div className="flex-1 h-6 rounded bg-border/30 overflow-hidden">
                  <div className={`h-full rounded ${d.color}`} style={{ width: `${projects.length ? (d.count / projects.length) * 100 : 0}%` }} />
                </div>
                <span className="text-xs font-medium w-6 text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Flagged projects table */}
      <Card className="glass-panel border-border">
        <CardHeader><CardTitle className="text-base">Flagged Projects</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : riskProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No risk anomalies detected</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Project</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead>Anomalies</TableHead>
                  <TableHead>Alerts</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riskProjects.map(p => (
                  <TableRow key={p.id} className="border-border/50">
                    <TableCell>
                      <Link to={`/dashboard/projects/${p.id}`} className="text-primary hover:underline font-medium">{p.name}</Link>
                      <div className="text-[10px] text-muted-foreground">{p.country} · {p.region}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {p.riskScore >= 50 ? <TrendingUp className="h-3 w-3 text-red-400" /> : <TrendingDown className="h-3 w-3 text-emerald-400" />}
                        <span className={`font-bold ${p.riskScore >= 75 ? 'text-red-400' : p.riskScore >= 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {p.riskScore}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.anomalies.map(a => (
                          <Badge key={a} variant="outline" className="text-[9px] border-red-500/30 text-red-400">{a}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.alertCount}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{p.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
