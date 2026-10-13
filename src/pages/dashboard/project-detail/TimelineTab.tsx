import type { Project } from '@/data/projects';
import { Badge } from '@/components/ui/badge';
import { TabsContent } from '@/components/ui/tabs';


export function TimelineTab({ project, canModerate, toggleMilestone }: { project: Project; canModerate: boolean; toggleMilestone: (id: string, current: boolean) => Promise<void> }) {
  return (
        <TabsContent value="timeline">
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-lg font-semibold mb-3">Milestones</h3>
            <div className="space-y-3">
              {project.milestones.length === 0 && <p className="text-sm text-muted-foreground">No milestones yet.</p>}
              {project.milestones.map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  {canModerate ? (
                    <button type="button" onClick={() => toggleMilestone(m.id, m.completed)} className={`h-4 w-4 rounded-full shrink-0 border-2 cursor-pointer ${m.completed ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground hover:border-primary'}`} />
                  ) : (
                    <span className={`h-4 w-4 rounded-full shrink-0 border-2 ${m.completed ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground'}`} />
                  )}
                  <div className="flex-1">
                    <span className="text-sm">{m.title}</span>
                    <span className="text-xs text-muted-foreground ml-2">{m.date}</span>
                  </div>
                  {m.completed && <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Complete</Badge>}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
  );
}
