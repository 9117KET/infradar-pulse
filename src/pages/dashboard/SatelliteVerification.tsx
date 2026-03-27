import { useProjects } from '@/hooks/use-projects';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Satellite, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SatelliteVerification() {
  const { projects, loading } = useProjects();

  // Derive satellite verification status from evidence
  const projectsWithSatData = projects.map(p => {
    const satEvidence = p.evidence.filter(e => e.type === 'Satellite');
    const verified = satEvidence.some(e => e.verified);
    const lastCheck = satEvidence.length > 0 ? satEvidence.sort((a, b) => b.date.localeCompare(a.date))[0].date : null;
    return { ...p, satEvidence, satelliteVerified: verified, lastSatCheck: lastCheck, satCount: satEvidence.length };
  });

  const verifiedCount = projectsWithSatData.filter(p => p.satelliteVerified).length;
  const pendingCount = projectsWithSatData.filter(p => p.satCount > 0 && !p.satelliteVerified).length;
  const noDataCount = projectsWithSatData.filter(p => p.satCount === 0).length;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
        <Satellite className="h-5 w-5 text-primary" /> Satellite Verification
      </h1>
      <p className="text-sm text-muted-foreground">Independent construction progress verification using commercial satellite imagery.</p>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">Total Projects</div>
            <CardTitle className="text-2xl">{projects.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-400" />Verified</div>
            <CardTitle className="text-2xl text-emerald-400">{verifiedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3 text-amber-400" />Pending</div>
            <CardTitle className="text-2xl text-amber-400">{pendingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><XCircle className="h-3 w-3 text-muted-foreground" />No Data</div>
            <CardTitle className="text-2xl">{noDataCount}</CardTitle>
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
                  <TableHead>Country</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Sat. Status</TableHead>
                  <TableHead>Images</TableHead>
                  <TableHead>Last Check</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectsWithSatData.map(p => (
                  <TableRow key={p.id} className="border-border/50">
                    <TableCell>
                      <Link to={`/dashboard/projects/${p.id}`} className="text-primary hover:underline font-medium">{p.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.country}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{p.stage}</Badge></TableCell>
                    <TableCell>
                      {p.satelliteVerified ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Verified</Badge>
                      ) : p.satCount > 0 ? (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Pending</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">No Data</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.satCount}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{p.lastSatCheck || '—'}</TableCell>
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
