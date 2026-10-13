import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, ExternalLink, MapPin, FileCheck2 } from 'lucide-react';
import { Pager } from './shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
interface Mut<V> { mutate(v: V): void; isPending: boolean }
interface PageProps { total: number; page: number; onPageChange: (p: number) => void }

export function OfficialTab({ rows, total, page, onPageChange, unpublishMutation }: PageProps & { rows: Row[]; unpublishMutation: Mut<string> }) {
  return (
    <>
            <p className="text-xs text-muted-foreground">
              Auto-published from official registries (World Bank, IFC, ADB, IADB, AIIB, GEM, EIB). These are already live —
              spot-check them here and unpublish anything that looks wrong; unpublished projects return to the Legacy Queue.
            </p>
            {rows.length === 0 ? (
              <div className="glass-panel rounded-xl p-12 text-center">
                <FileCheck2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-serif text-lg font-semibold">No auto-published projects yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Official-registry ingest runs will publish here once the backfill cron is armed.</p>
              </div>
            ) : <>
              <Pager page={page} total={total} onPageChange={onPageChange} />
              {rows.map((project: any) => (
                <div key={project.id} className="glass-panel rounded-xl p-5 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-serif font-semibold">{project.name}</h3>
                        <Badge variant="outline" className="border-sky-500/40 text-sky-400">Official registry</Badge>
                        <Badge variant="outline">{project.stage}</Badge>
                        {project.coord_precision && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            <MapPin className="h-3 w-3 mr-1" />{project.coord_precision === 'exact' ? 'Exact location' : 'Country-level location'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {project.country} · {project.sector || 'Unknown sector'} · {project.value_label} · confidence {project.confidence}%
                        {project.last_updated ? ` · published ${new Date(project.last_updated).toLocaleDateString()}` : ''}
                      </p>
                      {project.source_url && (
                        <a href={project.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />{project.source_url}
                        </a>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-400 hover:text-red-300 shrink-0"
                      onClick={() => unpublishMutation.mutate(project.id)}
                      disabled={unpublishMutation.isPending}
                    >
                      <X className="h-4 w-4 mr-1" />Unpublish
                    </Button>
                  </div>
                </div>
              ))}
              <Pager page={page} total={total} onPageChange={onPageChange} />
            </>}
    </>
  );
}
