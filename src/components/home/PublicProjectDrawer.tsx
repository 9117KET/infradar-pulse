import { Link } from 'react-router-dom';
import { Lock, MapPin, BarChart2, Layers, ArrowRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PublicProjectLocation } from '@/hooks/use-public-project-locations';

function riskLabel(score: number) {
  if (score >= 75) return { label: 'Critical', cls: 'bg-red-500/15 text-red-400 border-red-500/30' };
  if (score >= 50) return { label: 'High', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
  if (score >= 25) return { label: 'Medium', cls: 'bg-green-500/15 text-green-400 border-green-500/30' };
  return { label: 'Low', cls: 'bg-teal-500/15 text-teal-400 border-teal-500/30' };
}

function GatedRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/20">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 text-muted-foreground/40">
        <Lock className="h-3 w-3" />
        <span className="text-xs blur-sm select-none">██████████</span>
      </div>
    </div>
  );
}

interface PublicProjectDrawerProps {
  project: PublicProjectLocation | null;
  onClose: () => void;
}

export function PublicProjectDrawer({ project, onClose }: PublicProjectDrawerProps) {
  const risk = project ? riskLabel(project.risk_score) : null;

  return (
    <Sheet open={!!project} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-[420px] flex flex-col gap-0 p-0">
        {project && risk && (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/30">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-base font-semibold leading-snug text-left">
                    {project.name}
                  </SheetTitle>
                  <div className="flex items-center gap-1.5 mt-1.5 text-muted-foreground text-xs">
                    <MapPin className="h-3 w-3" />
                    <span>{project.country}</span>
                  </div>
                </div>
                <Badge variant="outline" className={`shrink-0 text-xs ${risk.cls}`}>
                  {risk.label} risk
                </Badge>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* Visible fields */}
              <div className="space-y-0 mb-6">
                <div className="flex items-center justify-between py-3 border-b border-border/20">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5" /> Sector
                  </span>
                  <span className="text-sm font-medium">{project.sector}</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-border/20">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <BarChart2 className="h-3.5 w-3.5" /> Risk score
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${project.risk_score >= 75 ? 'bg-red-500' : project.risk_score >= 50 ? 'bg-amber-500' : project.risk_score >= 25 ? 'bg-green-500' : 'bg-teal-400'}`}
                        style={{ width: `${project.risk_score}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono font-medium">{project.risk_score}</span>
                  </div>
                </div>
                {project.stage && (
                  <div className="flex items-center justify-between py-3 border-b border-border/20">
                    <span className="text-sm text-muted-foreground">Stage</span>
                    <Badge variant="secondary" className="text-xs">{project.stage}</Badge>
                  </div>
                )}
              </div>

              {/* Gated section */}
              <div className="relative mb-6">
                <div className="absolute inset-x-0 top-0 -mt-2 flex items-center gap-2">
                  <div className="flex-1 h-px bg-border/30" />
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 font-mono uppercase tracking-wide">
                    <Lock className="h-3 w-3" /> Members only
                  </div>
                  <div className="flex-1 h-px bg-border/30" />
                </div>
                <div className="pt-6 opacity-50 pointer-events-none select-none">
                  <GatedRow label="Pipeline value" />
                  <GatedRow label="Project description" />
                  <GatedRow label="Key stakeholders" />
                  <GatedRow label="Milestones & timeline" />
                  <GatedRow label="Evidence sources" />
                  <GatedRow label="Contacts" />
                </div>
              </div>

              {/* CTA */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-medium text-foreground mb-1">
                  Unlock the full project profile
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Free account includes financial data, evidence sources, contacts, milestones, and AI-generated intelligence briefs.
                </p>
                <Link
                  to={`/login?from=map&project=${project.id}`}
                  onClick={onClose}
                >
                  <Button className="w-full teal-glow gap-2">
                    Get free access <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
