import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Link2 } from 'lucide-react';
import { Pager } from './shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
interface Mut<V> { mutate(v: V): void; isPending: boolean }
interface PageProps { total: number; page: number; onPageChange: (p: number) => void }

export function DuplicatesTab({ rows, total, page, onPageChange, duplicateAction, candidateAction }: PageProps & { rows: Row[]; duplicateAction: Mut<{ id: string; action: 'merged' | 'not_duplicate' }>; candidateAction: Mut<{ id: string; action: 'requested_research' | 'rejected' }> }) {
  return (
    <>
            {rows.length === 0 ? (
              <div className="glass-panel rounded-xl p-12 text-center">
                <Link2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-serif text-lg font-semibold">No duplicate suggestions</h3>
                <p className="text-sm text-muted-foreground mt-1">Entity resolution suggestions will appear here before merge decisions.</p>
              </div>
            ) : <>
              <Pager page={page} total={total} onPageChange={onPageChange} />
              {rows.map((candidate: any) => (
                <div key={candidate.id} className="glass-panel rounded-xl p-5 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-serif font-semibold">{candidate.name}</h3>
                      <p className="text-xs text-muted-foreground">{candidate.country} · {candidate.sector || 'Unknown sector'} · {candidate.pipeline_status}</p>
                    </div>
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-400">Duplicate risk {candidate.duplicate_confidence ?? '—'}%</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{candidate.description || 'No extracted description.'}</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" className="teal-glow" onClick={() => duplicateAction.mutate({ id: candidate.id, action: 'merged' })} disabled={duplicateAction.isPending}><Link2 className="h-4 w-4 mr-1" />Merge duplicate</Button>
                    <Button size="sm" variant="outline" onClick={() => duplicateAction.mutate({ id: candidate.id, action: 'not_duplicate' })} disabled={duplicateAction.isPending}><Check className="h-4 w-4 mr-1" />Not a duplicate</Button>
                    <Button size="sm" variant="outline" onClick={() => candidateAction.mutate({ id: candidate.id, action: 'requested_research' })}>More research</Button>
                    <Button size="sm" variant="outline" className="text-red-400 hover:text-red-300" onClick={() => candidateAction.mutate({ id: candidate.id, action: 'rejected' })}><X className="h-4 w-4 mr-1" />Reject</Button>
                  </div>
                </div>
              ))}
              <Pager page={page} total={total} onPageChange={onPageChange} />
            </>}
    </>
  );
}
