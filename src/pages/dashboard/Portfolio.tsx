import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTrackedProjects } from '@/hooks/use-tracked-projects';
import { useProjects } from '@/hooks/use-projects';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Briefcase, Star, StickyNote, AlertTriangle, TrendingUp, DollarSign, Activity, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const STATUS_COLORS: Record<string, string> = {
  Verified: 'text-emerald-400 border-emerald-400/30',
  Stable: 'text-blue-400 border-blue-400/30',
  Pending: 'text-amber-400 border-amber-400/30',
  'At Risk': 'text-red-400 border-red-400/30',
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Portfolio() {
  const { trackedProjects, isLoading: trackLoading, toggleTrack, updateNotes } = useTrackedProjects();
  const { allProjects, loading: projectsLoading } = useProjects();
  const [notesDialogId, setNotesDialogId] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState('');

  const trackedIds = new Set(trackedProjects.map(t => t.project_id));

  const portfolioProjects = allProjects.filter(p => p.dbId && trackedIds.has(p.dbId));

  const { data: recentUpdates = [], isLoading: updatesLoading } = useQuery({
    queryKey: ['portfolio-updates', Array.from(trackedIds).join(',')],
    queryFn: async () => {
      if (trackedIds.size === 0) return [];
      const ids = Array.from(trackedIds);
      const { data } = await supabase
        .from('project_updates')
        .select('id, project_id, field_changed, old_value, new_value, source, created_at')
        .in('project_id', ids)
        .order('created_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: trackedIds.size > 0,
  });

  const totalValue = portfolioProjects.reduce((sum, p) => sum + (p.value || 0), 0);
  const avgRisk = portfolioProjects.length
    ? Math.round(portfolioProjects.reduce((s, p) => s + p.riskScore, 0) / portfolioProjects.length)
    : 0;
  const atRiskCount = portfolioProjects.filter(p => p.status === 'At Risk').length;

  const handleNotesOpen = (projectId: string) => {
    const tracked = trackedProjects.find(t => t.project_id === projectId);
    setNotesValue(tracked?.notes ?? '');
    setNotesDialogId(projectId);
  };

  const handleNotesSave = async () => {
    if (!notesDialogId) return;
    try {
      await updateNotes.mutateAsync({ projectId: notesDialogId, notes: notesValue });
      toast.success('Notes saved');
      setNotesDialogId(null);
    } catch {
      toast.error('Failed to save notes');
    }
  };

  const loading = trackLoading || projectsLoading;

  const recommendations = useMemo(() => {
    if (portfolioProjects.length < 2) return [];
    const sectorCount: Record<string, number> = {};
    const regionCount: Record<string, number> = {};
    portfolioProjects.forEach(p => {
      sectorCount[p.sector] = (sectorCount[p.sector] || 0) + 1;
      regionCount[p.region] = (regionCount[p.region] || 0) + 1;
    });
    const topSectors = Object.entries(sectorCount).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s);
    const topRegions = Object.entries(regionCount).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r]) => r);
    return allProjects
      .filter(p => p.dbId && !trackedIds.has(p.dbId) && (topSectors.includes(p.sector) || topRegions.includes(p.region)))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 6);
  }, [portfolioProjects, allProjects, trackedIds]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" /> My Portfolio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Projects you're tracking. Star any project to add it here.
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="glass-panel border-border">
          <CardHeader className="pb-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3" /> Tracked</div>
            <CardTitle className="text-2xl">{portfolioProjects.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Total Value</div>
            <CardTitle className="text-2xl">
              {totalValue >= 1e9
                ? `$${(totalValue / 1e9).toFixed(1)}B`
                : totalValue >= 1e6
                ? `$${(totalValue / 1e6).toFixed(0)}M`
                : totalValue > 0 ? `$${totalValue.toLocaleString()}` : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Avg Risk</div>
            <CardTitle className={`text-2xl ${avgRisk >= 70 ? 'text-red-400' : avgRisk >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {portfolioProjects.length ? avgRisk : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel border-border">
          <CardHeader className="pb-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> At Risk</div>
            <CardTitle className={`text-2xl ${atRiskCount > 0 ? 'text-red-400' : ''}`}>{atRiskCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Portfolio table */}
      <Card className="glass-panel border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tracked Projects</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : portfolioProjects.length === 0 ? (
            <div className="text-center py-12">
              <Star className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No tracked projects yet</p>
              <p className="text-xs text-muted-foreground mt-1">Star projects from the <Link to="/dashboard/projects" className="text-primary hover:underline">Projects</Link> page to add them here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Project</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {portfolioProjects.map(p => {
                  const tracked = trackedProjects.find(t => t.project_id === p.dbId);
                  return (
                    <TableRow key={p.id} className="border-border/50">
                      <TableCell>
                        <Link to={`/dashboard/projects/${p.id}`} className="text-primary hover:underline font-medium text-sm">{p.name}</Link>
                        <div className="text-[10px] text-muted-foreground">{p.country} · {p.sector}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{p.stage}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.value >= 1e9 ? `$${(p.value / 1e9).toFixed(1)}B` : p.value >= 1e6 ? `$${(p.value / 1e6).toFixed(0)}M` : p.value > 0 ? `$${p.value.toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-bold ${p.riskScore >= 70 ? 'text-red-400' : p.riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {p.riskScore}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[p.status] ?? ''}`}>{p.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleNotesOpen(p.dbId!)}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 max-w-[140px] truncate"
                          title={tracked?.notes || 'Add note…'}
                        >
                          <StickyNote className="h-3 w-3 shrink-0" />
                          <span className="truncate">{tracked?.notes || 'Add note…'}</span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => void toggleTrack(p.dbId!)}
                          className="h-7 w-7 flex items-center justify-center rounded hover:bg-amber-500/10 transition-colors"
                          title="Remove from portfolio"
                        >
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent updates on tracked projects */}
      {trackedIds.size > 0 && (
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" /> Recent Updates on Tracked Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            {updatesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : recentUpdates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent changes on your tracked projects.</p>
            ) : (
              <div className="space-y-2">
                {recentUpdates.map((update: any) => {
                  const proj = allProjects.find(p => p.dbId === update.project_id);
                  const fieldLabel = update.field_changed.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                  return (
                    <div key={update.id} className="flex items-start gap-3 py-1.5 border-b border-border/30 last:border-0">
                      <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/50 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {proj && (
                            <Link to={`/dashboard/projects/${proj.id}`} className="text-xs font-medium text-primary hover:underline">{proj.name}</Link>
                          )}
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <Badge variant="outline" className="text-[9px]">{fieldLabel}</Badge>
                          {update.new_value && (
                            <span className="text-[11px] text-emerald-400 truncate max-w-[200px]">{String(update.new_value).substring(0, 50)}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(update.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Smart Recommendations */}
      {recommendations.length > 0 && (
        <Card className="glass-panel border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Recommended for You
              <span className="text-xs font-normal text-muted-foreground ml-1">based on your portfolio</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recommendations.map(p => (
                <div key={p.id} className="rounded-lg border border-border/40 bg-muted/10 p-3 flex flex-col gap-2">
                  <Link to={`/dashboard/projects/${p.id}`} className="text-sm font-medium text-primary hover:underline leading-snug line-clamp-2">{p.name}</Link>
                  <div className="text-xs text-muted-foreground">{p.country} · {p.sector}</div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{p.stage}</Badge>
                      <span className={`text-xs font-bold ${p.riskScore >= 70 ? 'text-red-400' : p.riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        Risk {p.riskScore}
                      </span>
                    </div>
                    <button
                      onClick={() => void toggleTrack(p.dbId!)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Star className="h-3 w-3" /> Track
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes dialog */}
      <Dialog open={!!notesDialogId} onOpenChange={open => !open && setNotesDialogId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Project Notes</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Add private notes about this project…"
            value={notesValue}
            onChange={e => setNotesValue(e.target.value)}
            rows={5}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesDialogId(null)}>Cancel</Button>
            <Button onClick={() => void handleNotesSave()} disabled={updateNotes.isPending}>
              {updateNotes.isPending ? 'Saving…' : 'Save Notes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
