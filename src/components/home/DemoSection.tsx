import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { REGIONS, SECTORS, statusColor, type Region, type Sector, type Project } from '@/data/projects';
import { useProjects } from '@/hooks/use-projects';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MapPin, TrendingUp, Shield, Calendar, Users, X } from 'lucide-react';

const STATUSES_FILTER = ['Completed', 'In progress', 'Planned', 'Stopped'] as const;
type StatusFilter = typeof STATUSES_FILTER[number];

function mapStageToFilter(stage: string): StatusFilter {
  if (stage === 'Completed') return 'Completed';
  if (stage === 'Cancelled' || stage === 'Stopped') return 'Stopped';
  if (stage === 'Planned') return 'Planned';
  return 'In progress';
}

export function DemoSection() {
  const { projects: PROJECTS } = useProjects();
  const [selectedRegions, setSelectedRegions] = useState<Region[]>(['MENA']);
  const [selectedSectors, setSelectedSectors] = useState<Sector[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<StatusFilter[]>([]);
  const [valueRange, setValueRange] = useState([0, 600]);
  const [highConfidence, setHighConfidence] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  const filtered = useMemo(() => {
    return PROJECTS.filter(p => {
      if (selectedRegions.length && !selectedRegions.includes(p.region)) return false;
      if (selectedSectors.length && !selectedSectors.includes(p.sector)) return false;
      if (selectedStatuses.length && !selectedStatuses.includes(mapStageToFilter(p.stage))) return false;
      const valB = p.valueUsd / 1e9;
      if (valB < valueRange[0] || valB > valueRange[1]) return false;
      if (highConfidence && p.confidence < 95) return false;
      return true;
    });
  }, [selectedRegions, selectedSectors, selectedStatuses, valueRange, highConfidence]);

  const toggleArr = <T,>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];

  const aggregates = useMemo(() => ({
    count: filtered.length,
    totalValue: filtered.reduce((s, p) => s + p.valueUsd, 0),
    verified: filtered.filter(p => p.status === 'Verified').length,
    pending: filtered.filter(p => p.status === 'Pending').length,
    topSectors: [...new Set(filtered.map(p => p.sector))].slice(0, 3),
  }), [filtered]);

  return (
    <section id="demo" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">03 Proof</div>
        <h2 className="font-serif text-3xl font-bold sm:text-4xl max-w-2xl">See the signal pipeline in action</h2>
        <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed mb-12">
          Filter by region, inspect projects, and explore decision-ready intelligence—all from verified, multi-source data.
        </p>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Filters */}
          <div className="glass-panel rounded-xl p-5 space-y-6 h-fit">
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">Region</label>
              <div className="flex flex-wrap gap-2">
                {['Global' as const, ...REGIONS].map(r => (
                  <Button key={r} size="sm" variant={r === 'Global' ? (selectedRegions.length === 0 ? 'default' : 'outline') : (selectedRegions.includes(r as Region) ? 'default' : 'outline')}
                    className="text-xs h-7"
                    onClick={() => r === 'Global' ? setSelectedRegions([]) : setSelectedRegions(prev => toggleArr(prev, r as Region))}
                  >{r}</Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">Sectors</label>
              <div className="space-y-1.5">
                {SECTORS.map(s => (
                  <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={selectedSectors.includes(s)} onCheckedChange={() => setSelectedSectors(prev => toggleArr(prev, s))} />
                    <span className="text-muted-foreground">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUSES_FILTER.map(s => (
                  <Button key={s} size="sm" variant={selectedStatuses.includes(s) ? 'default' : 'outline'} className="text-xs h-7"
                    onClick={() => setSelectedStatuses(prev => toggleArr(prev, s))}
                  >{s}</Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">Value range ($B)</label>
              <Slider min={0} max={600} step={5} value={valueRange} onValueChange={setValueRange} className="mt-2" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>${valueRange[0]}B</span><span>${valueRange[1]}B</span>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={highConfidence} onCheckedChange={(v) => setHighConfidence(!!v)} />
              <span className="text-sm text-muted-foreground">High confidence only (≥95%)</span>
            </label>
          </div>

          {/* Map / List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{filtered.length} projects</span>
              <div className="flex gap-1">
                <Button size="sm" variant={viewMode === 'map' ? 'default' : 'outline'} className="text-xs h-7" onClick={() => setViewMode('map')}>Map</Button>
                <Button size="sm" variant={viewMode === 'list' ? 'default' : 'outline'} className="text-xs h-7" onClick={() => setViewMode('list')}>List</Button>
              </div>
            </div>

            {viewMode === 'map' ? (
              <div className="glass-panel rounded-xl overflow-hidden relative" style={{ height: 480 }}>
                {/* Simplified SVG map */}
                <svg viewBox="-20 -40 200 180" className="w-full h-full" style={{ background: 'hsl(210,12%,7%)' }}>
                  {/* Simplified Africa + MENA outline */}
                  <ellipse cx={80} cy={60} rx={70} ry={65} fill="none" stroke="hsl(210,10%,18%)" strokeWidth={0.5} />
                  <ellipse cx={80} cy={60} rx={50} ry={45} fill="none" stroke="hsl(210,10%,15%)" strokeWidth={0.3} />
                  {/* Grid lines */}
                  {[0, 30, 60, 90, 120].map(y => <line key={`h${y}`} x1={-20} y1={y - 20} x2={180} y2={y - 20} stroke="hsl(210,10%,12%)" strokeWidth={0.3} />)}
                  {[0, 40, 80, 120, 160].map(x => <line key={`v${x}`} x1={x - 10} y1={-40} x2={x - 10} y2={140} stroke="hsl(210,10%,12%)" strokeWidth={0.3} />)}
                  {/* Project pins */}
                  {filtered.map(p => {
                    const x = ((p.lng + 20) / 80) * 160 - 10;
                    const y = ((50 - p.lat) / 80) * 140 - 20;
                    return (
                      <g key={p.id} className="cursor-pointer" onClick={() => setSelectedProject(p)}>
                        <circle cx={x} cy={y} r={4} fill={statusColor[p.status]} opacity={0.3}>
                          <animate attributeName="r" values="4;7;4" dur="2s" repeatCount="indefinite" />
                        </circle>
                        <circle cx={x} cy={y} r={3} fill={statusColor[p.status]} stroke="hsl(210,12%,9%)" strokeWidth={1} />
                        <title>{p.name}</title>
                      </g>
                    );
                  })}
                </svg>
                <div className="absolute bottom-3 left-3 flex gap-3 text-[10px] text-muted-foreground">
                  {Object.entries(statusColor).map(([s, c]) => (
                    <span key={s} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{s}</span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(p => (
                  <div key={p.id} className="glass-panel rounded-lg p-4 flex items-center justify-between cursor-pointer hover:border-primary/30 transition-colors"
                    onClick={() => setSelectedProject(p)}>
                    <div className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColor[p.status] }} />
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.country} · {p.sector}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">{p.valueLabel}</p>
                      <p className="text-xs text-muted-foreground">{p.confidence}% confidence</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Aggregates strip */}
            <div className="glass-panel rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
              <div><div className="text-lg font-serif font-bold text-primary">{aggregates.count}</div><div className="text-xs text-muted-foreground">Projects</div></div>
              <div><div className="text-lg font-serif font-bold">{aggregates.totalValue >= 1e12 ? `$${(aggregates.totalValue / 1e12).toFixed(1)}T` : `$${(aggregates.totalValue / 1e9).toFixed(0)}B`}</div><div className="text-xs text-muted-foreground">Total Value</div></div>
              <div><div className="text-lg font-serif font-bold text-emerald-500">{aggregates.verified}</div><div className="text-xs text-muted-foreground">Verified</div></div>
              <div><div className="text-lg font-serif font-bold text-amber-500">{aggregates.pending}</div><div className="text-xs text-muted-foreground">Pending</div></div>
              <div><div className="text-xs font-medium">{aggregates.topSectors.join(', ')}</div><div className="text-xs text-muted-foreground mt-1">Top Sectors</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Project detail modal */}
      <Dialog open={!!selectedProject} onOpenChange={() => setSelectedProject(null)}>
        <DialogContent className="glass-panel-strong border-white/10 max-w-lg">
          {selectedProject && (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif text-xl">{selectedProject.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-primary/30 text-primary">{selectedProject.status}</Badge>
                  <Badge variant="outline">{selectedProject.stage}</Badge>
                  <Badge variant="outline">{selectedProject.sector}</Badge>
                  <Badge variant="outline">{selectedProject.region}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{selectedProject.description}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-panel rounded-lg p-3 text-center">
                    <TrendingUp className="h-4 w-4 mx-auto mb-1 text-primary" />
                    <div className="text-lg font-bold">{selectedProject.confidence}%</div>
                    <div className="text-[10px] text-muted-foreground">Confidence</div>
                  </div>
                  <div className="glass-panel rounded-lg p-3 text-center">
                    <Shield className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                    <div className="text-lg font-bold">{selectedProject.riskScore}</div>
                    <div className="text-[10px] text-muted-foreground">Risk Score</div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Calendar className="h-3 w-3" /> Timeline: {selectedProject.timeline}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><MapPin className="h-3 w-3" /> {selectedProject.country} ({selectedProject.lat.toFixed(2)}, {selectedProject.lng.toFixed(2)})</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3 w-3" /> {selectedProject.stakeholders.join(', ')}</div>
                </div>
                <div className="text-xs text-muted-foreground">Value: <span className="text-foreground font-semibold">{selectedProject.valueLabel}</span></div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
