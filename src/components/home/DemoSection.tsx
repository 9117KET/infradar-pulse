import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Globe, Map } from 'lucide-react';
import { HeroMap } from './HeroMap';
import { DemoGlobe } from './DemoGlobe';
import { PublicProjectDrawer } from './PublicProjectDrawer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { usePublicProjectLocations } from '@/hooks/use-public-project-locations';
import type { PublicProjectLocation } from '@/hooks/use-public-project-locations';

type ViewMode = 'globe' | 'map';

export function DemoSection() {
  const [viewMode, setViewMode] = useState<ViewMode>('globe');
  const [selectedProject, setSelectedProject] = useState<PublicProjectLocation | null>(null);
  const { locations, loading } = usePublicProjectLocations();

  const topSectors = useMemo(
    () => [...new Set(locations.map(p => p.sector))].slice(0, 3),
    [locations]
  );

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

          {/* Globe / Map toggle */}
          <div className="flex gap-1 self-start sm:self-auto shrink-0">
            <Button
              size="sm"
              variant={viewMode === 'globe' ? 'default' : 'outline'}
              className="gap-1.5 text-xs"
              onClick={() => setViewMode('globe')}
            >
              <Globe className="h-3.5 w-3.5" />
              Globe
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'map' ? 'default' : 'outline'}
              className="gap-1.5 text-xs"
              onClick={() => setViewMode('map')}
            >
              <Map className="h-3.5 w-3.5" />
              Map
            </Button>
          </div>
        </div>

        {/* Visualisation */}
        <motion.div
          key={viewMode}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="glass-panel rounded-xl overflow-hidden relative"
          style={{ height: 520 }}
        >
          {viewMode === 'globe' ? (
            <>
              <DemoGlobe projects={locations} className="w-full h-full" />
              {/* Risk legend */}
              <div className="absolute bottom-4 left-4 z-10 flex gap-3 text-[10px] text-muted-foreground bg-background/60 backdrop-blur-sm rounded-lg px-3 py-2">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#6bd8cb]" />Low</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#22c55e]" />Medium</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#f59e0b]" />High</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#dc2626]" />Critical</span>
              </div>
              {!loading && locations.length > 0 && (
                <div className="absolute top-4 right-4 z-10 text-[10px] font-mono text-muted-foreground bg-background/60 backdrop-blur-sm rounded-lg px-3 py-1.5">
                  Live pipeline data · click map view to explore
                </div>
              )}
            </>
          ) : (
            <HeroMap
              projects={locations}
              className="w-full h-full"
              onProjectClick={setSelectedProject}
            />
          )}
        </motion.div>

        {/* Aggregates strip — sectors only, no counts */}
        {!loading && topSectors.length > 0 && (
          <div className="mt-4 glass-panel rounded-xl p-4 text-center">
            <div className="text-xs font-medium">{topSectors.join(' · ')}</div>
            <div className="text-xs text-muted-foreground mt-1">Sectors tracked · Switch to Map and click a project to preview</div>
          </div>
        )}
      </div>

      <PublicProjectDrawer
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
      />
    </section>
  );
}
