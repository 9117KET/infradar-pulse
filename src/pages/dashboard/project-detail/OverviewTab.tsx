import type { Project } from '@/data/projects';
import { Badge } from '@/components/ui/badge';
import { TabsContent } from '@/components/ui/tabs';
import { Users } from 'lucide-react';


export function OverviewTab({ project }: { project: Project }) {
  return (
          <div className="glass-panel rounded-xl p-5">
            <p className="text-muted-foreground">{project.description}</p>
          </div>
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-serif text-lg font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4" />Stakeholders</h3>
            <div className="flex flex-wrap gap-2">
              {project.stakeholders.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
              {project.stakeholders.length === 0 && <p className="text-sm text-muted-foreground">No stakeholders listed.</p>}
            </div>
          </div>
        </TabsContent>
  );
}
