import { useParams, Link } from 'react-router-dom';
import { useProjects } from '@/hooks/use-projects';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, MapPin, Users, ExternalLink, ShieldCheck, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { projects, loading } = useProjects();
  const project = projects.find(p => p.id === id);

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Project not found.</p>
        <Link to="/dashboard/projects"><Button variant="outline" className="mt-4">Back to projects</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />Back to projects</Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="font-serif text-2xl font-bold">{project.name}</h1>
        <div className="flex gap-2">
          <Badge variant="outline" className="border-primary/30 text-primary">{project.status}</Badge>
          <Badge variant="outline">{project.stage}</Badge>
          <Badge variant="outline">{project.sector}</Badge>
        </div>
      </div>

      <p className="text-muted-foreground">{project.description}</p>

      {/* Score badges */}
      <div className="grid gap-4 sm:grid-cols-4">
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

      {/* Stakeholders */}
      <div className="glass-panel rounded-xl p-5">
        <h3 className="font-serif text-lg font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4" />Stakeholders</h3>
        <div className="flex flex-wrap gap-2">
          {project.stakeholders.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
        </div>
      </div>

      {/* Milestones */}
      <div className="glass-panel rounded-xl p-5">
        <h3 className="font-serif text-lg font-semibold mb-3">Milestones</h3>
        <div className="space-y-3">
          {project.milestones.map(m => (
            <div key={m.id} className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full shrink-0 ${m.completed ? 'bg-emerald-500' : 'bg-border'}`} />
              <div className="flex-1">
                <span className="text-sm">{m.title}</span>
                <span className="text-xs text-muted-foreground ml-2">{m.date}</span>
              </div>
              {m.completed && <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Complete</Badge>}
            </div>
          ))}
        </div>
      </div>

      {/* Evidence */}
      <div className="glass-panel rounded-xl p-5">
        <h3 className="font-serif text-lg font-semibold mb-3">Evidence</h3>
        <div className="space-y-2">
          {project.evidence.map(e => (
            <div key={e.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-[10px]">{e.type}</Badge>
                <span className="text-sm">{e.source}</span>
                <span className="text-xs text-muted-foreground">{e.date}</span>
              </div>
              <div className="flex items-center gap-2">
                {e.verified ? <Badge className="bg-emerald-500/20 text-emerald-500 text-[10px]">Verified</Badge> : <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">Unverified</Badge>}
                <a href={e.url} target="_blank" rel="noopener"><ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" /></a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
