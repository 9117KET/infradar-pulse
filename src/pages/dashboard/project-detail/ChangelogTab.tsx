import { Badge } from '@/components/ui/badge';
import { TabsContent } from '@/components/ui/tabs';
import { History } from 'lucide-react';
import type { ChangelogEntry } from './types';


export function ChangelogTab({ changelog }: { changelog: ChangelogEntry[] }) {
  return (
        <TabsContent value="changelog">
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-lg font-semibold mb-4 flex items-center gap-2">
              <History className="h-4 w-4" /> Project Changelog
            </h3>
            {changelog.length === 0 ? (
              <p className="text-sm text-muted-foreground">No changes recorded yet. Changes are tracked automatically when project data is updated.</p>
            ) : (
              <div className="space-y-1">
                {changelog.reduce((acc: { date: string; entries: typeof changelog }[], entry: any) => {
                  const date = new Date(entry.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
                  const last = acc[acc.length - 1];
                  if (last?.date === date) { last.entries.push(entry); }
                  else { acc.push({ date, entries: [entry] }); }
                  return acc;
                }, []).map((group) => (
                  <div key={group.date}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-2 border-b border-border/40 mb-2">{group.date}</p>
                    <div className="space-y-2 mb-4">
                      {group.entries.map((entry) => {
                        const fieldLabel = entry.field_changed
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, (c: string) => c.toUpperCase());
                        const timeStr = new Date(entry.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                        return (
                          <div key={entry.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                            <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-[9px]">{fieldLabel}</Badge>
                                {entry.old_value && (
                                  <span className="text-[11px] text-muted-foreground line-through">{String(entry.old_value).substring(0, 60)}</span>
                                )}
                                {entry.old_value && entry.new_value && <span className="text-[11px] text-muted-foreground">→</span>}
                                {entry.new_value && (
                                  <span className="text-[11px] text-emerald-400">{String(entry.new_value).substring(0, 60)}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {entry.source && (
                                  <Badge variant="secondary" className="text-[9px]">{entry.source}</Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground">{timeStr}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
  );
}
