import { useEffect } from 'react';
import { useProjects } from '@/hooks/use-projects';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, RefreshCw, Clock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ProjectUpdate {
  id: string;
  project_id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  source: string | null;
  created_at: string;
}

export default function RealTimeMonitoring() {
  const { projects, loading } = useProjects();
  const queryClient = useQueryClient();

  const { data: updates = [], isLoading: updatesLoading } = useQuery({
    queryKey: ['project-updates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_updates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ProjectUpdate[];
    },
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('monitoring-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_updates' }, () => {
        queryClient.invalidateQueries({ queryKey: ['project-updates'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Enrich updates with project names
  const projectMap = new Map(projects.map(p => {
    // The projects from useProjects use slug as id, but updates use uuid
    return [p.id, p];
  }));

  // Build a lookup from DB directly for project names by uuid
  const { data: dbProjects = [] } = useQuery({
    queryKey: ['db-projects-lookup'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, slug').eq('approved', true);
      return data || [];
    },
  });
  const dbProjectMap = new Map(dbProjects.map((p: any) => [p.id, p]));

  const activeProjects = projects.filter(p => p.stage === 'Construction' || p.stage === 'Financing' || p.stage === 'Awarded').length;
  const recentUpdates24h = updates.filter(u => new Date(u.created_at) > new Date(Date.now() - 86400000)).length;

  // Confidence decay: projects not updated in 30+ days
  const staleProjects = projects.filter(p => {
    const lastUpdate = new Date(p.lastUpdated);
    return Date.now() - lastUpdate.getTime() > 30 * 86400000;
  });

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-bold flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" /> Real-Time Project Monitoring
      </h1>
      <p className="text-sm text-muted-foreground">Continuous tracking of infrastructure project milestones, delays, and status changes.</p>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">Active Projects</div>
            <CardTitle className="text-2xl">{activeProjects}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><RefreshCw className="h-3 w-3" />Updates (24h)</div>
            <CardTitle className="text-2xl">{recentUpdates24h}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3 text-amber-400" />Stale (30d+)</div>
            <CardTitle className="text-2xl text-amber-400">{staleProjects.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground">Total Updates</div>
            <CardTitle className="text-2xl">{updates.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Stale projects warning */}
      {staleProjects.length > 0 && (
        <Card className="glass-panel border-border border-amber-500/20">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-amber-400" /> Confidence Decay Warning</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">These projects haven't been updated in 30+ days. Confidence scores may be declining.</p>
            <div className="flex flex-wrap gap-2">
              {staleProjects.slice(0, 8).map(p => (
                <Link key={p.id} to={`/dashboard/projects/${p.id}`}>
                  <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10 cursor-pointer">
                    {p.name} <ArrowRight className="h-2.5 w-2.5 ml-1" />
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent updates feed */}
      <Card className="glass-panel border-border">
        <CardHeader><CardTitle className="text-base">Recent Updates</CardTitle></CardHeader>
        <CardContent className="p-0">
          {updatesLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : updates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No updates recorded yet. Run agents from Settings to generate updates.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Project</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {updates.slice(0, 20).map(u => {
                  const proj = dbProjectMap.get(u.project_id);
                  return (
                    <TableRow key={u.id} className="border-border/50">
                      <TableCell className="font-medium">
                        {proj ? (
                          <Link to={`/dashboard/projects/${(proj as any).slug}`} className="text-primary hover:underline">{(proj as any).name}</Link>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs capitalize">{u.field_changed}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs">
                          {u.old_value && <span className="text-red-400 line-through">{u.old_value}</span>}
                          {u.old_value && u.new_value && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                          {u.new_value && <span className="text-emerald-400">{u.new_value}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{u.source || '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{new Date(u.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
