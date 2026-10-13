import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, ExternalLink, Inbox } from 'lucide-react';
import { Pager } from './shared';
import { calculateIntelligenceQuality } from '@/lib/intelligence-quality';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
interface Mut<V> { mutate(v: V): void; isPending: boolean }
interface PageProps { total: number; page: number; onPageChange: (p: number) => void }

export function PipelineTab({ candidates, total, page, onPageChange, candidateAction }: PageProps & { candidates: Row[]; candidateAction: Mut<{ id: string; action: 'requested_research' | 'rejected' | 'approved' }> }) {
  return (
    <>
            {candidates.length === 0 ? (
              <div className="glass-panel rounded-xl p-12 text-center">
                <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-serif text-lg font-semibold">No pipeline candidates</h3>
                <p className="text-sm text-muted-foreground mt-1">Source-first candidates will appear here after ingest and extraction.</p>
              </div>
            ) : <>
              <Pager page={page} total={total} onPageChange={onPageChange} />
              {candidates.map((candidate: any) => {
              const quality = calculateIntelligenceQuality({
                sourceUrl: candidate.source_url,
                confidence: candidate.confidence,
                description: candidate.description,
                valueUsd: candidate.value_usd,
                lat: candidate.lat,
                lng: candidate.lng,
                evidenceCount: Array.isArray(candidate.extracted_claims?.evidence_ids) ? candidate.extracted_claims.evidence_ids.length : 0,
                lastUpdated: candidate.updated_at,
              });
              return (
                <div key={candidate.id} className="glass-panel rounded-xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-serif font-semibold">{candidate.name}</h3>
                        <Badge variant="outline">{candidate.stage}</Badge>
                        <Badge variant="outline" className="bg-primary/10 text-primary">Quality {quality.totalScore}</Badge>
                        <Badge variant="outline" className="capitalize">{quality.recommendation.replace('_', ' ')}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{candidate.country} · {candidate.region || 'Unknown region'} · {candidate.sector || 'Unknown sector'}</p>
                      <p className="text-sm text-muted-foreground line-clamp-2">{candidate.description || 'No description extracted yet.'}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {quality.missingFields.map(field => <Badge key={field} variant="outline" className="text-[10px]">Missing {field}</Badge>)}
                        {quality.flags.map(flag => <Badge key={flag} variant="outline" className="text-[10px]">{flag.replace(/_/g, ' ')}</Badge>)}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => candidateAction.mutate({ id: candidate.id, action: 'requested_research' })}>More research</Button>
                      <Button size="sm" variant="outline" onClick={() => candidateAction.mutate({ id: candidate.id, action: 'rejected' })}><X className="h-4 w-4 mr-1" />Reject</Button>
                      <Button size="sm" className="teal-glow" onClick={() => candidateAction.mutate({ id: candidate.id, action: 'approved' })}><Check className="h-4 w-4 mr-1" />Approve</Button>
                    </div>
                  </div>
                  {candidate.source_url && <a href={candidate.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />{candidate.source_url}</a>}
                </div>
              );
              })}
              <Pager page={page} total={total} onPageChange={onPageChange} />
            </>}
    </>
  );
}
