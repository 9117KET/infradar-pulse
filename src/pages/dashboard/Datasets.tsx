import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Database, RefreshCw } from 'lucide-react';
import { agentApi } from '@/lib/api/agents';
import { toast } from 'sonner';

type Snapshot = {
  id: string;
  dataset_key: string;
  generated_at: string;
  payload: unknown;
};

type ProjectsV1Project = {
  id: string;
  name: string;
  country: string;
  sector: string;
  risk_score: number;
};

type ProjectsV1Payload = {
  totals?: { projects_approved?: number };
  latest_projects?: ProjectsV1Project[];
  highest_risk?: ProjectsV1Project[];
};

export default function Datasets() {
  const [datasetKey, setDatasetKey] = useState('projects_v1');

  const { data: snapshot, isLoading, refetch } = useQuery({
    queryKey: ['dataset-snapshot', datasetKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('dataset_snapshots')
        .select('id,dataset_key,generated_at,payload')
        .eq('dataset_key', datasetKey)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Snapshot | null;
    },
  });

  const runRefresh = async () => {
    try {
      await agentApi.runDatasetRefresh({ dataset_key: datasetKey });
      toast.success('Dataset refresh started');
      await refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to refresh dataset';
      toast.error(msg);
    }
  };

  const payload = (snapshot?.payload ?? null) as ProjectsV1Payload | null;
  const latest = payload?.latest_projects ?? [];
  const risky = payload?.highest_risk ?? [];
  const totals = payload?.totals ?? {};

  const generatedAt = useMemo(() => (snapshot?.generated_at ? new Date(snapshot.generated_at).toLocaleString() : null), [snapshot]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" /> Datasets
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Premium interactive datasets backed by snapshots.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={datasetKey} onValueChange={setDatasetKey}>
            <SelectTrigger className="w-[180px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="projects_v1">Projects (v1)</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => void runRefresh()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Snapshot</CardTitle>
          {generatedAt && <Badge variant="outline" className="text-[10px]">Generated {generatedAt}</Badge>}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !snapshot ? (
            <div className="text-sm text-muted-foreground">No snapshot yet. Refresh to generate one.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">Approved projects</div>
                <div className="text-2xl font-bold">{totals.projects_approved ?? 0}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">Latest projects in snapshot</div>
                <div className="text-2xl font-bold">{latest.length}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">High-risk projects in snapshot</div>
                <div className="text-2xl font-bold">{risky.length}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {snapshot && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="glass-panel border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Latest</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Project</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latest.map((p) => (
                    <TableRow key={p.id} className="border-border/50">
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.country}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{p.sector}</Badge></TableCell>
                      <TableCell className={p.risk_score >= 50 ? 'text-red-400' : p.risk_score >= 25 ? 'text-amber-400' : 'text-emerald-400'}>
                        {p.risk_score}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Highest risk</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Project</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {risky.map((p) => (
                    <TableRow key={p.id} className="border-border/50">
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.country}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{p.sector}</Badge></TableCell>
                      <TableCell className={p.risk_score >= 50 ? 'text-red-400' : p.risk_score >= 25 ? 'text-amber-400' : 'text-emerald-400'}>
                        {p.risk_score}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

