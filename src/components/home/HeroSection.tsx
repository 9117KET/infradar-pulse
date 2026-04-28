import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { HeroLiveTracker } from '@/components/home/HeroLiveTracker';
import { usePublicProjectLocations } from '@/hooks/use-public-project-locations';

function formatPipelineValue(total: number): string {
  if (total >= 1e12) return `$${(total / 1e12).toFixed(1)}T`;
  if (total >= 1e9) return `$${(total / 1e9).toFixed(0)}B`;
  if (total >= 1e6) return `$${(total / 1e6).toFixed(0)}M`;
  return `$${total.toLocaleString()}`;
}

export function HeroSection() {
  const { locations, loading } = usePublicProjectLocations();

  const trackerProjects = useMemo(() =>
    locations.map(p => ({
      id: p.id,
      name: p.name,
      country: p.country,
      sector: p.sector,
      stage: p.stage ?? '',
      status: 'Verified',
      valueUsd: p.value_usd ?? 0,
      valueLabel: p.value_usd ? formatPipelineValue(p.value_usd) : '',
      riskScore: p.risk_score,
      region: p.region ?? undefined,
    })),
    [locations]
  );

  const stats = useMemo(() => ({
    projects: locations.length,
    countries: new Set(locations.map(p => p.country)).size,
    pipelineValue: locations.reduce((s, p) => s + (p.value_usd ?? 0), 0),
  }), [locations]);

  return (
    <section className="relative min-h-[90vh] flex items-center overflow-visible" style={{ overflow: 'visible' }}>
      {/* Radial teal gradient */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 50% at 20% 50%, rgba(107,216,203,0.08) 0%, transparent 70%)' }} />

      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16">
        {/* Left */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="flex flex-col justify-center">
          <div className="mb-6 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Global infrastructure intelligence</span>
          </div>

          <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            VERIFIED INFRASTRUCTURE{' '}
            <em className="text-gradient-teal not-italic">INTELLIGENCE</em>{' '}
            FOR HIGH-STAKES DECISIONS
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Built for business development teams, EPC contractors, project managers, infrastructure consultants, development finance analysts, project finance professionals, owners, developers, and procurement teams who need timely market intelligence. Real-time signals across <span className="text-foreground font-medium">14 regions</span>, AI Q&amp;A, and report-quality briefs from live verified data.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login"><Button size="lg" className="teal-glow font-sans">Get Started Free</Button></Link>
            <a href="#demo"><Button size="lg" variant="outline" className="font-sans">Watch demo</Button></a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            {loading ? (
              <span className="text-muted-foreground/50">Loading live data…</span>
            ) : (
              <>
                <span>
                  <strong className="text-foreground">{stats.projects.toLocaleString()}</strong> verified projects
                </span>
                <span className="hidden sm:inline text-border">·</span>
                <span>
                  <strong className="text-foreground">{stats.countries}</strong> countries
                </span>
                <span className="hidden sm:inline text-border">·</span>
                <Link to="/explore" className="text-primary hover:underline underline-offset-2">
                  Explore the dataset →
                </Link>
              </>
            )}
          </div>
        </motion.div>

        {/* Right: live tracker */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }} className="flex items-center justify-center">
          <HeroLiveTracker projects={trackerProjects} />
        </motion.div>
      </div>
    </section>
  );
}
