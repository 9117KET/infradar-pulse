import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Clock, Database, PauseCircle, RefreshCw, ShieldAlert, CircleCheck } from 'lucide-react';

interface BackfillJob {
  id: string;
  source_key: string;
  agent_type: string;
  page_size: number;
  cursor_offset: number;
  fetched_count: number;
  total_estimate: number | null;
  state: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | string;
  priority: number;
  consecutive_errors: number;
  last_error: string | null;
  last_run_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

interface RunnerLock {
  lock_name: string;
  lease_until: string | null;
  holder: string | null;
  updated_at: string;
}

const stateVariant = (state: BackfillJob['state']) => {
  if (state === 'completed') return 'default' as const;
  if (state === 'paused' || state === 'failed') return 'destructive' as const;
  return 'secondary' as const;
};

function age(iso: string | null): string {
  if (!iso) return 'Never';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function BackfillProgress() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['backfill-progress'],
    queryFn: async () => {
      const [{ data: jobs, error: jobsError }, { data: locks, error: locksError }] = await Promise.all([
        supabase.from('backfill_jobs').select('*').order('priority', { ascending: true }).order('updated_at', { ascending: true }),
        supabase.from('backfill_runner_locks').select('*').eq('lock_name', 'backfill-runner').maybeSingle(),
      ]);
      if (jobsError) throw jobsError;
      if (locksError) throw locksError;
      return { jobs: (jobs ?? []) as BackfillJob[], lock: locks as RunnerLock | null };
    },
    refetchInterval: 15000,
  });

  const jobs = data?.jobs ?? [];
  const active = jobs.filter((job) => job.state === 'running' || job.state === 'pending').length;
  const paused = jobs.filter((job) => job.state === 'paused' || job.state === 'failed');
  const completed = jobs.filter((job) => job.state === 'completed').length;
  const lockActive = data?.lock?.lease_until && new Date(data.lock.lease_until).getTime() > Date.now();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl font-bold flex items-center gap-2"><Database className="h-6 w-6 text-primary" /> Backfill Progress</h1>
          <p className="text-sm text-muted-foreground mt-1">Bounded public-data ingestion queue with persisted progress and safety state.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Queued / running</p><p className="text-2xl font-bold">{active}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Completed</p><p className="text-2xl font-bold text-emerald-400">{completed}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Paused / failed</p><p className="text-2xl font-bold text-destructive">{paused.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Runner lock</p><p className="text-2xl font-bold">{lockActive ? 'Active' : 'Ready'}</p></CardContent></Card>
      </div>

      {paused.length > 0 && <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertTitle>Backfill work needs attention</AlertTitle><AlertDescription>{paused.length} source job{paused.length === 1 ? '' : 's'} are paused after repeated or terminal errors. Review the source details below before resuming.</AlertDescription></Alert>}

      <Card>
        <CardHeader><CardTitle className="text-lg">Source queue</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading backfill queue…</p>}
          {!isLoading && jobs.length === 0 && <p className="text-sm text-muted-foreground">No backfill jobs have been queued.</p>}
          {jobs.map((job) => {
            const progress = job.total_estimate && job.total_estimate > 0 ? Math.min(100, (job.fetched_count / job.total_estimate) * 100) : null;
            return <div key={job.id} className="border-b border-border last:border-0 pb-4 last:pb-0 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0"><p className="font-medium truncate">{job.source_key}</p><p className="text-xs text-muted-foreground">{job.agent_type} · page size {job.page_size} · updated {age(job.updated_at)}</p></div>
                <Badge variant={stateVariant(job.state)}>{job.state}</Badge>
              </div>
              {progress !== null ? <><Progress value={progress} className="h-2" /><p className="text-xs text-muted-foreground">{job.fetched_count.toLocaleString()} of {job.total_estimate?.toLocaleString()} records · offset {job.cursor_offset.toLocaleString()}</p></> : <p className="text-xs text-muted-foreground">{job.fetched_count.toLocaleString()} records fetched · offset {job.cursor_offset.toLocaleString()}</p>}
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap"><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {age(job.last_run_at)}</span><span>{job.consecutive_errors} consecutive errors</span>{job.state === 'completed' && <span className="inline-flex items-center gap-1 text-emerald-400"><CircleCheck className="h-3.5 w-3.5" /> Finished</span>}{job.state === 'paused' && <span className="inline-flex items-center gap-1 text-destructive"><PauseCircle className="h-3.5 w-3.5" /> Paused safely</span>}</div>
              {job.last_error && <p className="text-xs text-destructive/90 break-words">{job.last_error}</p>}
            </div>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}
