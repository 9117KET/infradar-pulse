import { useProjects } from '@/hooks/use-projects';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MultiSourceValidation() {
  const { projects, loading } = useProjects();

  const EVIDENCE_TYPES = ['Satellite', 'Filing', 'News', 'Registry', 'Partner'] as const;

  const projectsWithValidation = projects.map(p => {
    const typesPresent = new Set(p.evidence.map(e => e.type));
    const verifiedCount = p.evidence.filter(e => e.verified).length;
    const totalCount = p.evidence.length;
    const coverage = EVIDENCE_TYPES.filter(t => typesPresent.has(t)).length;
    const hasConflict = p.evidence.some(e => !e.verified) && p.evidence.some(e => e.verified);
    return { ...p, typesPresent, verifiedCount, totalCount, coverage, hasConflict };
  });

  const fullyCovered = projectsWithValidation.filter(p => p.coverage >= 4).length;
  const conflictCount = projectsWithValidation.filter(p => p.hasConflict).length;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" /> Multi-Source Validation
      </h1>
      <p className="text-sm text-muted-foreground">Cross-referencing government filings, news feeds, registry data, and partner intelligence.</p>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">Total Sources</div>
            <CardTitle className="text-2xl">{projects.reduce((s, p) => s + p.evidence.length, 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-400" />Verified</div>
            <CardTitle className="text-2xl text-emerald-400">{projects.reduce((s, p) => s + p.evidence.filter(e => e.verified).length, 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">4+ Source Types</div>
            <CardTitle className="text-2xl">{fullyCovered}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-400" />Conflicts</div>
            <CardTitle className="text-2xl text-amber-400">{conflictCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="glass-panel border-border">
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Project</TableHead>
                  <TableHead>Sources</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectsWithValidation.map(p => (
                  <TableRow key={p.id} className="border-border/50">
                    <TableCell>
                      <Link to={`/dashboard/projects/${p.id}`} className="text-primary hover:underline font-medium">{p.name}</Link>
                    </TableCell>
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
