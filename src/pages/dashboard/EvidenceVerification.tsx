import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Satellite, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const EVIDENCE_TYPES = ['Satellite', 'Filing', 'News', 'Registry', 'Partner'] as const;
const PAGE_SIZE = 50;
const TYPE_COLORS: Record<string, string> = {
  Satellite: 'hsl(var(--primary))',
  Filing: 'hsl(210, 60%, 55%)',
  News: 'hsl(40, 80%, 55%)',
  Registry: 'hsl(280, 50%, 55%)',
  Partner: 'hsl(160, 50%, 45%)',
};

export default function EvidenceVerification() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);

  const evidenceStats = useQuery({
    queryKey: ['evidence-verification-stats'],
    queryFn: async () => {
      const [{ count: totalSources }, { count: totalVerified }, { data: evidenceTypes }, { data: satRows }] = await Promise.all([
        supabase.from('evidence_sources').select('id', { count: 'exact', head: true }),
        supabase.from('evidence_sources').select('id', { count: 'exact', head: true }).eq('verified', true),
        supabase.from('evidence_sources').select('type, verified').range(0, 4999),
        supabase.from('evidence_sources').select('project_id').eq('type', 'Satellite').eq('verified', true).range(0, 4999),
      ]);
      const satVerifiedProjects = new Set((satRows ?? []).map((row: any) => row.project_id)).size;
      return { totalSources: totalSources ?? 0, totalVerified: totalVerified ?? 0, evidenceTypes: evidenceTypes ?? [], satVerifiedProjects };
    },
  });

  const projectsPage = useQuery({
    queryKey: ['evidence-verification-projects', page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const { data: projectRows, error, count } = await supabase
        .from('projects')
        .select('id, slug, name, country, confidence', { count: 'exact' })
        .eq('approved', true)
        .order('last_updated', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const projectIds = (projectRows ?? []).map((p: any) => p.id);
      const { data: evidenceRows, error: evidenceError } = projectIds.length
        ? await supabase.from('evidence_sources').select('id, project_id, source, url, type, verified, date, title, description, added_by').in('project_id', projectIds).range(0, 999)
        : { data: [], error: null };
      if (evidenceError) throw evidenceError;

      const evidenceMap: Record<string, any[]> = {};
      (evidenceRows ?? []).forEach((e: any) => {
        if (!evidenceMap[e.project_id]) evidenceMap[e.project_id] = [];
        evidenceMap[e.project_id].push(e);
      });

      return {
        rows: (projectRows ?? []).map((p: any) => ({ ...p, id: p.slug, dbId: p.id, evidence: evidenceMap[p.id] ?? [] })),
        total: count ?? 0,
      };
    },
  });

  const projects = projectsPage.data?.rows ?? [];
  const totalProjects = projectsPage.data?.total ?? 0;
  const loading = projectsPage.isLoading;
  const totalPages = Math.max(1, Math.ceil(totalProjects / PAGE_SIZE));

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
  const allEvidence = evidenceStats.data?.evidenceTypes ?? [];
  const totalSources = evidenceStats.data?.totalSources ?? 0;
  const totalVerified = evidenceStats.data?.totalVerified ?? 0;
  const satVerified = evidenceStats.data?.satVerifiedProjects ?? 0;
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
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{totalProjects === 0 ? '0' : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalProjects)} of {totalProjects} projects</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>Previous</Button>
              <span>Page {page + 1} of {totalPages}</span>
              <Button size="sm" variant="outline" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page + 1 >= totalPages}>Next</Button>
            </div>
          </div>
        </CardHeader>
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
        <CardHeader className="pt-3">
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <Button size="sm" variant="outline" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>Previous</Button>
            <span>Page {page + 1} of {totalPages}</span>
            <Button size="sm" variant="outline" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page + 1 >= totalPages}>Next</Button>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
