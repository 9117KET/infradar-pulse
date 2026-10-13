import type { Project } from '@/data/projects';
import { TrendingUp, ShieldCheck, Heart, Calendar, MapPin } from 'lucide-react';
import { HealthScoreBadge } from '@/components/dashboard/HealthScoreBadge';


export function ProjectScores({ project }: { project: Project }) {
  return (
      <div className="grid gap-4 sm:grid-cols-5">
        <div className="glass-panel rounded-xl p-4 text-center">
          <TrendingUp className="h-5 w-5 mx-auto mb-1 text-primary" />
          <div className="text-2xl font-bold">{project.confidence}%</div>
          <div className="text-xs text-muted-foreground">Confidence</div>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center">
          <ShieldCheck className="h-5 w-5 mx-auto mb-1 text-amber-500" />
          <div className="text-2xl font-bold">{project.riskScore}</div>
          <div className="text-xs text-muted-foreground">Risk Score</div>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center flex flex-col items-center justify-center gap-1">
          <Heart className="h-5 w-5 text-emerald-400" />
          <HealthScoreBadge
            healthScore={project.healthScore}
            delayProbability={project.delayProbability}
            signals={project.healthSignals}
            size="sm"
            showDelay={false}
          />
          {project.delayProbability != null && (
            <div className="text-[11px] text-muted-foreground">{Math.round(project.delayProbability * 100)}% delay risk</div>
          )}
          <div className="text-xs text-muted-foreground">Health</div>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center">
          <Calendar className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <div className="text-sm font-bold mt-1">{project.timeline}</div>
          <div className="text-xs text-muted-foreground">Timeline</div>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center">
          <MapPin className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <div className="text-sm font-bold mt-1">{project.country}</div>
          <div className="text-xs text-muted-foreground">{project.region}</div>
        </div>
      </div>
  );
}
