import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useInsights } from '@/hooks/use-insights';
import { useProjects } from '@/hooks/use-projects';
import { format } from 'date-fns';
import { Clock, ArrowRight, Activity, Globe2, Layers } from 'lucide-react';

function formatPipelineValue(usd: number): string {
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(2)}T`;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  return `$${Math.round(usd).toLocaleString()}`;
}

export default function Insights() {
  const { data: insights = [], isLoading } = useInsights(true);
  const { projects, loading: projectsLoading } = useProjects();

  const pipeline = useMemo(() => {
    const count = projects.length;
    const totalUsd = projects.reduce((s, p) => s + p.valueUsd, 0);
    const regionIds = new Set(projects.map((p) => p.region));
    const sectorIds = new Set(projects.map((p) => p.sector));
    const byRegion = projects.reduce<Record<string, number>>((acc, p) => {
      acc[p.region] = (acc[p.region] || 0) + 1;
      return acc;
    }, {});
    const topRegions = Object.entries(byRegion)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const updatedRecently = projects.filter((p) => {
      const t = new Date(p.lastUpdated).getTime();
      return !Number.isNaN(t) && t >= thirtyDaysAgo;
    }).length;
    const atRisk = projects.filter((p) => p.status === 'At Risk').length;
    const verified = projects.filter((p) => p.status === 'Verified').length;
    return {
      count,
      totalUsd,
      regionCount: regionIds.size,
      sectorCount: sectorIds.size,
      topRegions,
      updatedRecently,
      atRisk,
      verified,
    };
  }, [projects]);

  const statCards = [
    {
      value: projectsLoading ? '…' : pipeline.count.toLocaleString(),
      label: 'Approved projects (live)',
      hint: 'Synced from our database; updates as the pipeline changes.',
    },
    {
      value: projectsLoading ? '…' : formatPipelineValue(pipeline.totalUsd),
      label: 'Aggregate reported value',
      hint: 'Sum of value_usd across approved projects.',
    },
    {
      value: projectsLoading ? '…' : `${pipeline.regionCount} / 14`,
      label: 'Regions in use',
      hint: 'Fourteen global regions; count shows how many have at least one project.',
    },
    {
      value: projectsLoading ? '…' : pipeline.updatedRecently.toLocaleString(),
      label: 'Touched in last 30 days',
      hint: 'Projects with a recent last-updated date (fresh signal).',
    },
  ];

  return (
    <div className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h1 className="font-serif text-4xl font-bold mb-4">Insights</h1>
        <p className="text-muted-foreground max-w-2xl mb-10">
          Research, analysis, and perspectives on infrastructure intelligence worldwide. Below is a live snapshot of projects
          in our verified pipeline (same data as the platform), plus long-form articles from our team.
        </p>

        {/* Live pipeline snapshot */}
        <div className="glass-panel rounded-xl p-6 md:p-8 mb-14 border border-primary/10">
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <Activity className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="font-serif text-xl font-semibold">Live pipeline snapshot</h2>
            <Badge variant="outline" className="border-primary/40 text-primary text-xs">
              Real-time
            </Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {statCards.map((s) => (
              <div key={s.label} className="rounded-lg bg-background/40 p-4 border border-border/60">
                <div className="text-2xl font-serif font-bold text-primary tabular-nums">{s.value}</div>
                <div className="text-xs font-medium text-foreground mt-1">{s.label}</div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-snug">{s.hint}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                <Globe2 className="h-4 w-4" /> Top regions by project count
              </div>
              {pipeline.topRegions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approved projects yet. Check back after onboarding data.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {pipeline.topRegions.map(([region, n]) => (
                    <Badge key={region} variant="secondary" className="text-xs font-normal">
                      {region}: {n}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                <Layers className="h-4 w-4" /> Quality flags
              </div>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>
                  <span className="text-foreground font-medium">{projectsLoading ? '…' : pipeline.verified}</span> verified
                  projects
                </li>
                <li>
                  <span className="text-foreground font-medium">{projectsLoading ? '…' : pipeline.atRisk}</span> flagged
                  &quot;At Risk&quot; (worth a closer read in the dashboard)
                </li>
                <li>
                  <span className="text-foreground font-medium">{projectsLoading ? '…' : pipeline.sectorCount}</span>{' '}
                  sectors represented in the current pipeline
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/login">
              <Button className="teal-glow">Open dashboard</Button>
            </Link>
            <Link to="/#demo">
              <Button variant="outline">Try the interactive map</Button>
            </Link>
          </div>
        </div>

        <h2 className="font-serif text-2xl font-bold mb-6">Articles</h2>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground animate-pulse">Loading insights…</div>
        ) : insights.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground mb-8">No published articles yet. Pipeline data above is still live.</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3 mb-16">
            {insights.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Link
                  to={`/insights/${p.slug}`}
                  className="glass-panel rounded-xl p-6 hover:border-primary/30 transition-colors block h-full group"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="border-primary/30 text-primary text-xs">
                      {p.tag}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{format(new Date(p.created_at), 'MMM yyyy')}</span>
                  </div>
                  <h3 className="font-serif text-lg font-semibold mb-2 group-hover:text-primary transition-colors">{p.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{p.excerpt}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {p.reading_time_min} min read
                    </span>
                    <span className="flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      Read <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        <div className="text-center">
          <Link to="/login">
            <Button className="teal-glow">Get Started Free</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
