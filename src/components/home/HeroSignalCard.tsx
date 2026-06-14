import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Building2, Zap, Droplets, Train, Wifi, Sun, Cpu, Factory, Fuel,
  Hexagon, Home, Landmark, Mountain, Server, Check, ArrowRight,
} from 'lucide-react';

interface SignalProject {
  id: string;
  name: string;
  country: string;
  sector: string;
  stage: string;
  status: string;
  valueLabel: string;
  valueUsd: number;
  riskScore: number;
  region?: string;
}

const SECTOR_ICONS: Record<string, typeof Building2> = {
  'AI Infrastructure': Cpu, 'Building Construction': Home, 'Chemical': Hexagon,
  'Data Centers': Server, 'Digital Infrastructure': Wifi, 'Energy': Zap,
  'Industrial': Factory, 'Infrastructure': Landmark, 'Mining': Mountain,
  'Oil & Gas': Fuel, 'Renewable Energy': Sun, 'Transport': Train,
  'Urban Development': Building2, 'Water': Droplets,
};

function riskLabel(score: number): string {
  if (score >= 70) return 'High';
  if (score >= 45) return 'Elevated';
  if (score >= 20) return 'Moderate';
  return 'Low';
}

function riskTone(score: number): string {
  if (score >= 70) return 'text-red-400';
  if (score >= 45) return 'text-amber-400';
  return 'text-emerald-400';
}

function riskBar(score: number): string {
  if (score >= 70) return 'bg-red-400';
  if (score >= 45) return 'bg-amber-400';
  return 'bg-emerald-400';
}

/**
 * Editorial hero widget: one real, verified project shown as a focused
 * intelligence brief, rotating slowly through the highest-value projects.
 * Deliberately calm — no scan-line, no "LIVE" badge, no simulated charts.
 * Uses only the safe public columns already fetched for the landing page.
 */
export function HeroSignalCard({ projects }: { projects: SignalProject[] }) {
  const [index, setIndex] = useState(0);

  const featured = useMemo(
    () => [...projects]
      .filter(p => p.name && p.valueUsd > 0)
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .slice(0, 6),
    [projects],
  );

  useEffect(() => {
    if (featured.length <= 1) return;
    const id = setInterval(() => setIndex(i => (i + 1) % featured.length), 9000);
    return () => clearInterval(id);
  }, [featured.length]);

  const p = featured[index % (featured.length || 1)];
  const total = projects.length;

  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* Soft ambient glow — single, subtle */}
      <div
        className="absolute -inset-8 rounded-[2rem] opacity-20 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.45), transparent 70%)' }}
      />

      <div className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl">
        {/* Eyebrow */}
        <div className="flex items-center justify-between px-6 pt-5">
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-primary/90">
            Verified intelligence
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
            {total ? `${String(index + 1).padStart(2, '0')} / ${total.toLocaleString()}` : '—'}
          </span>
        </div>

        {!p ? (
          // Calm skeleton while live data loads
          <div className="px-6 py-10 space-y-4 animate-pulse">
            <div className="h-3 w-24 rounded bg-muted/40" />
            <div className="h-7 w-3/4 rounded bg-muted/40" />
            <div className="h-3 w-32 rounded bg-muted/30" />
            <div className="h-12 w-full rounded bg-muted/20 mt-6" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
              className="px-6 pt-4 pb-5"
            >
              {/* Sector · stage */}
              <div className="flex items-center gap-2 text-muted-foreground">
                {(() => { const Icon = SECTOR_ICONS[p.sector] || Building2; return <Icon className="h-3.5 w-3.5 text-primary/80" />; })()}
                <span className="text-xs">{p.sector}</span>
                {p.stage && (
                  <>
                    <span className="text-border">·</span>
                    <span className="text-xs">{p.stage}</span>
                  </>
                )}
              </div>

              {/* Name */}
              <h3 className="mt-2 font-serif text-2xl font-semibold leading-snug text-foreground">
                {p.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {p.country}{p.region ? ` · ${p.region}` : ''}
              </p>

              {/* Metrics */}
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Pipeline value</p>
                  <p className="mt-0.5 text-xl font-semibold font-mono tabular-nums text-foreground">{p.valueLabel || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Risk</p>
                  <p className={`mt-0.5 text-xl font-semibold font-mono tabular-nums ${riskTone(p.riskScore)}`}>
                    {p.riskScore}<span className="text-xs font-normal text-muted-foreground"> · {riskLabel(p.riskScore)}</span>
                  </p>
                  <div className="mt-1.5 h-1 w-full rounded-full bg-muted/40 overflow-hidden">
                    <div className={`h-full rounded-full ${riskBar(p.riskScore)}`} style={{ width: `${Math.min(p.riskScore, 100)}%` }} />
                  </div>
                </div>
              </div>

              {/* Verification line */}
              <div className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Verified · cross-checked against primary sources</span>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Footer: rotation dots + explore */}
        <div className="flex items-center justify-between border-t border-border/30 px-6 py-3">
          <div className="flex items-center gap-1.5">
            {featured.map((f, i) => (
              <button
                key={f.id}
                aria-label={`Show project ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'}`}
              />
            ))}
          </div>
          <Link to="/explore" className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2">
            Explore the dataset <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
