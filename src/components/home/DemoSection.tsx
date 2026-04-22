import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Activity, Layers } from 'lucide-react';
import { HeroMap } from './HeroMap';
import { PublicProjectDrawer } from './PublicProjectDrawer';
import { usePublicProjectLocations } from '@/hooks/use-public-project-locations';
import type { PublicProjectLocation } from '@/hooks/use-public-project-locations';

function getRiskLevel(score: number) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

export function DemoSection() {
  const [selectedProject, setSelectedProject] = useState<PublicProjectLocation | null>(null);
  const [activeSector, setActiveSector] = useState<string | null>(null);
  const { locations, loading } = usePublicProjectLocations();

  const sectors = useMemo(
    () => [...new Set(locations.map(p => p.sector).filter(Boolean))].sort(),
    [locations]
  );

  const filtered = useMemo(
    () => activeSector ? locations.filter(p => p.sector === activeSector) : locations,
    [locations, activeSector]
  );

  const stats = useMemo(() => {
    const total = filtered.length;
    const critical = filtered.filter(p => getRiskLevel(p.risk_score) === 'critical').length;
    const high = filtered.filter(p => getRiskLevel(p.risk_score) === 'high').length;
    const countries = new Set(filtered.map(p => p.country)).size;
    return { total, critical, high, countries };
  }, [filtered]);

  return (
    <section id="demo" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">03 Proof</div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <h2 className="font-serif text-3xl font-bold sm:text-4xl max-w-2xl">See the signal pipeline in action</h2>
            <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
              Every project we track, plotted in real time across the globe — from energy megaprojects to digital infrastructure buildouts.
            </p>
          </div>

          {!loading && (
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Live pipeline
            </div>
          )}
        </div>

        {/* Stats strip */}
        {!loading && stats.total > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="glass-panel rounded-xl p-4">
              <div className="text-2xl font-bold font-mono">{stats.total}</div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">Active projects</div>
            </div>
            <div className="glass-panel rounded-xl p-4">
              <div className="text-2xl font-bold font-mono">{stats.countries}</div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">Countries</div>
            </div>
            <div className="glass-panel rounded-xl p-4">
              <div className="text-2xl font-bold font-mono text-[#f59e0b]">{stats.high}</div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">High risk</div>
            </div>
            <div className="glass-panel rounded-xl p-4">
              <div className="text-2xl font-bold font-mono text-[#dc2626]">{stats.critical}</div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">Critical risk</div>
            </div>
          </div>
        )}

        {/* Sector filter chips */}
        {!loading && sectors.length > 0 && (
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
            <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Button
              size="sm"
              variant={activeSector === null ? 'default' : 'outline'}
              className="text-xs h-7 shrink-0"
              onClick={() => setActiveSector(null)}
            >
              All sectors
            </Button>
            {sectors.map(s => (
              <Button
                key={s}
                size="sm"
                variant={activeSector === s ? 'default' : 'outline'}
                className="text-xs h-7 shrink-0 capitalize"
                onClick={() => setActiveSector(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        )}

        {/* Map visualisation */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="glass-panel rounded-xl overflow-hidden relative"
          style={{ height: 560 }}
        >
          <HeroMap
            projects={filtered}
            className="w-full h-full"
            onProjectClick={setSelectedProject}
          />
          {/* Risk legend */}
          <div className="absolute bottom-4 left-4 z-[400] flex flex-wrap gap-3 text-[10px] text-foreground/90 bg-background/70 backdrop-blur-md border border-border/50 rounded-lg px-3 py-2">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#6bd8cb]" />Low</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#22c55e]" />Medium</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#f59e0b]" />High</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#dc2626]" />Critical</span>
          </div>
          {!loading && filtered.length > 0 && (
            <div className="absolute top-4 right-4 z-[400] flex items-center gap-1.5 text-[10px] font-mono text-foreground/90 bg-background/70 backdrop-blur-md border border-border/50 rounded-lg px-3 py-1.5">
              <Activity className="h-3 w-3 text-primary" />
              Click a marker to preview
            </div>
          )}
        </motion.div>
      </div>

      <PublicProjectDrawer
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
      />
    </section>
  );
}
