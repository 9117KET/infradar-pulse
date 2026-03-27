import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const FEED_ITEMS = [
  { country: 'Saudi Arabia', status: 'Verified', name: 'NEOM Infrastructure', value: '$500B program', note: 'Verified this week', color: 'bg-emerald-500' },
  { country: 'Nigeria', status: 'Stable', name: 'Trans-Saharan Grid', value: '$12.4B', note: 'Delay risk: low', color: 'bg-primary' },
  { country: 'Kenya', status: 'Pending', name: 'East Africa Rail', value: '$8.2B', note: 'Awaiting verification', color: 'bg-amber-500' },
];

export function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
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
            Track high-value projects across <span className="text-foreground font-medium">MENA and Africa</span> with <span className="text-foreground font-medium">AI-assisted, human-verified</span> signals—one decision-ready pipeline in hours, not weeks.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#contact"><Button size="lg" className="teal-glow font-sans">Join waitlist</Button></a>
            <a href="#demo"><Button size="lg" variant="outline" className="font-sans">Watch demo</Button></a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <span><strong className="text-foreground">20+</strong> Data sources</span>
            <span className="hidden sm:inline text-border">·</span>
            <span><strong className="text-foreground">24h</strong> Alert latency</span>
            <span className="hidden sm:inline text-border">·</span>
            <span><em className="text-primary not-italic">Read-only</em> Preview available</span>
          </div>
        </motion.div>

        {/* Right — Verified Feed card */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }} className="flex items-center justify-center">
          <div className="w-full max-w-md glass-panel rounded-xl p-5 teal-glow">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">Verified feed</span>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
            </div>
            <div className="space-y-3">
              {FEED_ITEMS.map((item, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg bg-white/[0.03] p-3 border border-white/5">
                  <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${item.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">{item.country}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">{item.status}</Badge>
                    </div>
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">{item.value}</span>
                      <span className="text-xs text-muted-foreground">{item.note}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <a href="#contact" className="text-xs font-medium text-primary hover:underline">Request full access</a>
              <span className="text-[10px] text-muted-foreground italic">Demo data · illustrative only</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
