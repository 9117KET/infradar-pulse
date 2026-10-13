import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, ExternalLink, RefreshCw } from 'lucide-react';
import { Pager } from './shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
interface Mut<V> { mutate(v: V): void; isPending: boolean }
interface PageProps { total: number; page: number; onPageChange: (p: number) => void }

export function UpdatesTab({ proposals, total, page, onPageChange, updateAction }: PageProps & { proposals: Row[]; updateAction: Mut<{ id: string; action: 'approved' | 'rejected' }> }) {
  return (
    <>
            {proposals.length === 0 ? (
              <div className="glass-panel rounded-xl p-12 text-center">
                <RefreshCw className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-serif text-lg font-semibold">No pending updates</h3>
                <p className="text-sm text-muted-foreground mt-1">Approved project changes will wait here before being applied.</p>
              </div>
            ) : <>
              <Pager page={page} total={total} onPageChange={onPageChange} />
              {proposals.map((proposal: any) => (
              <div key={proposal.id} className="glass-panel rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-serif font-semibold">{proposal.projects?.name || 'Project update'}</h3>
                      <Badge variant="outline">Confidence {proposal.confidence}%</Badge>
                      <Badge variant="outline">{proposal.proposed_by_agent}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{proposal.impact || 'Field changes detected.'}</p>
                    <pre className="text-xs bg-muted/30 rounded-md p-3 overflow-auto max-h-36">{JSON.stringify(proposal.field_changes, null, 2)}</pre>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => updateAction.mutate({ id: proposal.id, action: 'rejected' })}><X className="h-4 w-4 mr-1" />Reject</Button>
                    <Button size="sm" className="teal-glow" onClick={() => updateAction.mutate({ id: proposal.id, action: 'approved' })}><Check className="h-4 w-4 mr-1" />Approve</Button>
                  </div>
                </div>
                {proposal.source_url && <a href={proposal.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />{proposal.source_url}</a>}
              </div>
              ))}
              <Pager page={page} total={total} onPageChange={onPageChange} />
            </>}
    </>
  );
}
