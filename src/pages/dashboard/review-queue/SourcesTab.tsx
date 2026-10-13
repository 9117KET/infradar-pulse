import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, FileCheck2, RefreshCw } from 'lucide-react';
import { Pager } from './shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
interface Mut<V> { mutate(v: V): void; isPending: boolean }
interface PageProps { total: number; page: number; onPageChange: (p: number) => void }

export function SourcesTab({ rows, total, page, onPageChange, sourceAction }: PageProps & { rows: Row[]; sourceAction: Mut<{ id: string; action: 'retry' | 'pause' }> }) {
  return (
    <>
            {rows.length === 0 ? (
              <div className="glass-panel rounded-xl p-12 text-center">
                <FileCheck2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-serif text-lg font-semibold">No stale or failing sources</h3>
                <p className="text-sm text-muted-foreground mt-1">Source registry issues will appear here when crawls fail or sources go stale.</p>
              </div>
            ) : <>
              <Pager page={page} total={total} onPageChange={onPageChange} />
              {rows.map((source: any) => (
                <div key={source.id} className="glass-panel rounded-xl p-5 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-serif font-semibold">{source.name}</h3>
                      <p className="text-xs text-muted-foreground">{source.kind} · reliability {source.reliability_score}% · last success {source.last_success_at ? new Date(source.last_success_at).toLocaleDateString() : 'never'}</p>
                    </div>
                    <Badge variant="outline" className="bg-red-500/15 text-red-400 capitalize">{source.status}</Badge>
                  </div>
                  {source.last_error && <p className="text-sm text-muted-foreground line-clamp-2">{source.last_error}</p>}
                  {source.base_url && <a href={source.base_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />{source.base_url}</a>}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => sourceAction.mutate({ id: source.id, action: 'retry' })} disabled={sourceAction.isPending}><RefreshCw className="h-4 w-4 mr-1" />Re-activate</Button>
                    {source.status !== 'paused' && (
                      <Button size="sm" variant="outline" onClick={() => sourceAction.mutate({ id: source.id, action: 'pause' })} disabled={sourceAction.isPending}>Pause</Button>
                    )}
                  </div>
                </div>
              ))}
              <Pager page={page} total={total} onPageChange={onPageChange} />
            </>}
    </>
  );
}
