import type { Project } from '@/data/projects';
import { Badge } from '@/components/ui/badge';
import { TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus, Check, Trash2, ExternalLink } from 'lucide-react';
const EVIDENCE_TYPES = ['Satellite', 'Filing', 'News', 'Registry', 'Partner'] as const;

interface EvidenceTabProps {
  project: Project;
  canModerate: boolean;
  showAddEvidence: boolean;
  setShowAddEvidence: (value: boolean) => void;
  evSource: string;
  setEvSource: (value: string) => void;
  evUrl: string;
  setEvUrl: (value: string) => void;
  evType: string;
  setEvType: (value: string) => void;
  evDesc: string;
  setEvDesc: (value: string) => void;
  evDate: string;
  setEvDate: (value: string) => void;
  handleAddEvidence: () => Promise<void>;
  toggleVerified: (id: string, current: boolean) => Promise<void>;
  deleteEvidence: (id: string) => Promise<void>;
}

export function EvidenceTab({ project, canModerate, showAddEvidence, setShowAddEvidence, evSource, setEvSource, evUrl, setEvUrl, evType, setEvType, evDesc, setEvDesc, evDate, setEvDate, handleAddEvidence, toggleVerified, deleteEvidence }: EvidenceTabProps) {
  return (
          <div className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-lg font-semibold">Evidence Sources</h3>
              {canModerate && (
                <Button size="sm" variant="outline" onClick={() => setShowAddEvidence(!showAddEvidence)}>
                  {showAddEvidence ? <X className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  {showAddEvidence ? 'Cancel' : 'Add Source'}
                </Button>
              )}
            </div>

            {showAddEvidence && (
              <div className="mb-4 p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input value={evSource} onChange={e => setEvSource(e.target.value)} placeholder="Source name *" className="bg-black/20" />
                  <Input value={evUrl} onChange={e => setEvUrl(e.target.value)} placeholder="URL (https://...)" className="bg-black/20" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select value={evType} onValueChange={setEvType}>
                    <SelectTrigger className="bg-black/20" aria-label="Evidence type"><SelectValue /></SelectTrigger>
                    <SelectContent>{EVIDENCE_TYPES.map(t => <SelectItem key={t} value={t}>{t === 'Satellite' ? 'Multi-Source' : t}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={evDate} onChange={e => setEvDate(e.target.value)} placeholder="Date" className="bg-black/20" />
                  <Input value={evDesc} onChange={e => setEvDesc(e.target.value)} placeholder="Description" className="bg-black/20" />
                </div>
                <Button size="sm" onClick={handleAddEvidence}>Add Evidence</Button>
              </div>
            )}

            <div className="space-y-2">
              {project.evidence.length === 0 && <p className="text-sm text-muted-foreground">No evidence sources yet.</p>}
              {project.evidence.map(e => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Badge variant="outline" className="text-[10px] shrink-0">{e.type === 'Satellite' ? 'Multi-Source' : e.type}</Badge>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{e.source}</span>
                        {e.added_by === 'human' && <Badge className="text-[9px] bg-blue-500/20 text-blue-400">Human</Badge>}
                        {e.added_by === 'ai' && <Badge className="text-[9px] bg-purple-500/20 text-purple-400">AI</Badge>}
                      </div>
                      {e.description && <p className="text-xs text-muted-foreground truncate">{e.description}</p>}
                      <span className="text-xs text-muted-foreground">{e.date}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canModerate && (
                      <>
                        <button type="button" onClick={() => toggleVerified(e.id, e.verified)}>
                          {e.verified
                            ? <Badge className="bg-emerald-500/20 text-emerald-500 text-[10px] cursor-pointer hover:bg-emerald-500/30"><Check className="h-2 w-2 mr-0.5" />Verified</Badge>
                            : <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 cursor-pointer hover:bg-amber-500/10">Unverified</Badge>}
                        </button>
                        <button type="button" onClick={() => deleteEvidence(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                      </>
                    )}
                    {e.url && e.url !== '#' && (
                      <a href={e.url} target="_blank" rel="noopener"><ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" /></a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
  );
}
