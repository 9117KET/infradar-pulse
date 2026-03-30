import { useState, useMemo } from 'react';
import { useProjects } from '@/hooks/use-projects';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Satellite, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const EVIDENCE_TYPES = ['Satellite', 'Filing', 'News', 'Registry', 'Partner'] as const;
const TYPE_COLORS: Record<string, string> = {
  Satellite: 'hsl(var(--primary))',
  Filing: 'hsl(210, 60%, 55%)',
  News: 'hsl(40, 80%, 55%)',
  Registry: 'hsl(280, 50%, 55%)',
  Partner: 'hsl(160, 50%, 45%)',
};

export default function EvidenceVerification() {
  const { projects, loading } = useProjects();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const projectsWithData = useMemo(() => projects.map(p => {
    const typesPresent = new Set<string>(p.evidence.map(e => e.type));
    const verifiedCount = p.evidence.filter(e => e.verified).length;
    const totalCount = p.evidence.length;
    const coverage = EVIDENCE_TYPES.filter(t => typesPresent.has(t as string)).length;
    const hasConflict = p.evidence.some(e => !e.verified) && p.evidence.some(e => e.verified);
    const satEvidence = p.evidence.filter(e => e.type === 'Satellite');
    const satelliteVerified = satEvidence.some(e => e.verified);
    const lastSatCheck = satEvidence.length > 0 ? satEvidence.sort((a, b) => b.date.localeCompare(a.date))[0].date : null;
    return { ...p, typesPresent, verifiedCount, totalCount, coverage, hasConflict, satEvidence, satelliteVerified, lastSatCheck, satCount: satEvidence.length };
  }), [projects]);

  // Filtered
  const filtered = projectsWithData.filter(p => {
    if (typeFilter !== 'all' && !p.typesPresent.has(typeFilter)) return false;
    if (statusFilter === 'verified' && p.verifiedCount === 0) return false;
    if (statusFilter === 'conflict' && !p.hasConflict) return false;
    if (statusFilter === 'no-data' && p.totalCount > 0) return false;
    return true;
  });

  // Stats
  const allEvidence = projects.flatMap(p => p.evidence);
  const totalSources = allEvidence.length;
  const totalVerified = allEvidence.filter(e => e.verified).length;
  const satVerified = projectsWithData.filter(p => p.satelliteVerified).length;
  const fullCoverage = projectsWithData.filter(p => p.coverage >= 4).length;
  const conflictCount = projectsWithData.filter(p => p.hasConflict).length;

  // Chart data
  const typeDistribution = EVIDENCE_TYPES.map(t => ({
    name: t,
    value: allEvidence.filter(e => e.type === t).length,
    fill: TYPE_COLORS[t],
  }));

  const verificationRates = EVIDENCE_TYPES.map(t => {
    const ofType = allEvidence.filter(e => e.type === t);
    const ver = ofType.filter(e => e.verified).length;
    return { name: t, rate: ofType.length > 0 ? Math.round((ver / ofType.length) * 100) : 0, fill: TYPE_COLORS[t] };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Evidence & Verification
        </h1>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {EVIDENCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="conflict">Conflicts</SelectItem>
              <SelectItem value="no-data">No Data</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">Total Sources</div>
            <CardTitle className="text-2xl">{totalSources}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-400" />Verified</div>
            <CardTitle className="text-2xl text-emerald-400">{totalVerified}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Satellite className="h-3 w-3 text-primary" />Sat. Verified</div>
            <CardTitle className="text-2xl text-primary">{satVerified}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">4+ Sources</div>
            <CardTitle className="text-2xl">{fullCoverage}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-400" />Conflicts</div>
            <CardTitle className="text-2xl text-amber-400">{conflictCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Evidence by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={typeDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                  {typeDistribution.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, color: 'hsl(var(--foreground))' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {typeDistribution.map(t => (
                <div key={t.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: t.fill }} />
                  <span className="text-muted-foreground">{t.name}</span>
                  <span className="font-medium">{t.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Verification Rate by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={verificationRates} layout="vertical" margin={{ left: 60 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={60} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, color: 'hsl(var(--foreground))' }} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                  {verificationRates.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Coverage Heatmap */}
      <Card className="glass-panel border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Source Coverage Heatmap</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid gap-0.5" style={{ gridTemplateColumns: `200px repeat(${EVIDENCE_TYPES.length}, 1fr)` }}>
              <div className="text-xs text-muted-foreground font-medium p-2">Project</div>
              {EVIDENCE_TYPES.map(t => (
                <div key={t} className="text-xs text-muted-foreground font-medium p-2 text-center">{t}</div>
              ))}
              {filtered.slice(0, 20).map(p => (
                <>
                  <div key={`name-${p.id}`} className="text-xs p-2 truncate">
                    <Link to={`/dashboard/projects/${p.id}`} className="text-primary hover:underline">{p.name}</Link>
                  </div>
                  {EVIDENCE_TYPES.map(t => {
                    const hasType = p.typesPresent.has(t);
                    const verified = p.evidence.some(e => e.type === t && e.verified);
                    return (
                      <div key={`${p.id}-${t}`} className={`rounded-sm h-8 flex items-center justify-center text-[10px] font-medium ${
                        verified ? 'bg-emerald-500/20 text-emerald-400' :
                        hasType ? 'bg-amber-500/15 text-amber-400' :
                        'bg-muted/30 text-muted-foreground/30'
                      }`}>
                        {verified ? '✓' : hasType ? '●' : '-'}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Full Table */}
      <Card className="glass-panel border-border">
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Project</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Sources</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Sat. Status</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id} className="border-border/50">
                    <TableCell>
                      <Link to={`/dashboard/projects/${p.id}`} className="text-primary hover:underline font-medium">{p.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.country}</TableCell>
                    <TableCell>
                      <div className="flex gap-0.5 flex-wrap">
                        {EVIDENCE_TYPES.map(t => (
                          <Badge key={t} variant="outline" className={`text-[9px] ${p.typesPresent.has(t) ? 'border-primary/30 text-primary' : 'border-border text-muted-foreground/40'}`}>
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className={`h-2 w-4 rounded-sm ${i < p.coverage ? 'bg-primary' : 'bg-border'}`} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.satelliteVerified ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Verified</Badge>
                      ) : p.satCount > 0 ? (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Pending</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">N/A</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.verifiedCount}/{p.totalCount}</TableCell>
                    <TableCell>
                      {p.hasConflict ? (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Conflict</Badge>
                      ) : p.totalCount > 0 ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Consistent</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">No Data</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={p.confidence >= 80 ? 'text-emerald-400' : p.confidence >= 60 ? 'text-amber-400' : 'text-red-400'}>
                        {p.confidence}%
                      </span>
                    </TableCell>
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
