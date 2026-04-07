import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Globe, Map } from 'lucide-react';
import { statusColor, type Project } from '@/data/projects';
import { SAMPLE_PROJECTS } from '@/data/sampleProjects';
import { HeroMap } from './HeroMap';
import { DemoGlobe } from './DemoGlobe';

type ViewMode = 'globe' | 'map';

export function DemoSection() {
  const PROJECTS: Project[] = SAMPLE_PROJECTS;
  const [viewMode, setViewMode] = useState<ViewMode>('globe');

  const aggregates = useMemo(() => ({
    count: PROJECTS.length,
    totalValue: PROJECTS.reduce((s: number, p: Project) => s + p.valueUsd, 0),
    verified: PROJECTS.filter((p: Project) => p.status === 'Verified').length,
    pending: PROJECTS.filter((p: Project) => p.status === 'Pending').length,
    topSectors: [...new Set(PROJECTS.map((p: Project) => p.sector))].slice(0, 3),
  }), [PROJECTS]);

  const mapProjects = useMemo(
    () =>
      PROJECTS.map((p: Project) => ({
        lat: p.lat,
        lng: p.lng,
        name: p.name,
        country: p.country,
        sector: p.sector,
        riskScore: p.riskScore,
        valueLabel: p.valueLabel,
        id: p.id,
      })),
    [PROJECTS]
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
              <DemoGlobe projects={mapProjects} className="w-full h-full" />
              {/* Risk legend */}
              <div className="absolute bottom-4 left-4 z-10 flex gap-3 text-[10px] text-muted-foreground bg-background/60 backdrop-blur-sm rounded-lg px-3 py-2">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#6bd8cb]" />Low</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#22c55e]" />Medium</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#f59e0b]" />High</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#dc2626]" />Critical</span>
              </div>
              <div className="absolute top-4 right-4 z-10 text-[10px] font-mono text-muted-foreground bg-background/60 backdrop-blur-sm rounded-lg px-3 py-1.5">
                {PROJECTS.length} active projects worldwide
              </div>
            </>
          ) : (
            <>
              <HeroMap projects={mapProjects} className="w-full h-full" />
              <div className="absolute bottom-3 left-3 z-[1000] flex gap-3 text-[10px] text-muted-foreground">
                {Object.entries(statusColor).map(([s, c]) => (
                  <span key={s} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: c }} />{s}
                  </span>
                ))}
              </div>
            </>
          )}
        </motion.div>

        {/* Aggregates strip */}
        <div className="mt-4 glass-panel rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <div>
            <div className="text-lg font-serif font-bold text-primary">{aggregates.count}</div>
            <div className="text-xs text-muted-foreground">Projects</div>
          </div>
          <div>
            <div className="text-lg font-serif font-bold">
              {aggregates.totalValue >= 1e12
                ? `$${(aggregates.totalValue / 1e12).toFixed(1)}T`
                : `$${(aggregates.totalValue / 1e9).toFixed(0)}B`}
            </div>
            <div className="text-xs text-muted-foreground">Total Value</div>
          </div>
          <div>
            <div className="text-lg font-serif font-bold text-emerald-500">{aggregates.verified}</div>
            <div className="text-xs text-muted-foreground">Verified</div>
          </div>
          <div>
            <div className="text-lg font-serif font-bold text-amber-500">{aggregates.pending}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          <div>
            <div className="text-xs font-medium">{aggregates.topSectors.join(', ')}</div>
            <div className="text-xs text-muted-foreground mt-1">Top Sectors</div>
          </div>
        </div>
      </div>
    </section>
  );
}
