import { motion } from 'framer-motion';

const STATS = [
  { value: '85%', label: 'Projects delayed', sub: 'Major infrastructure programs' },
  { value: '$1.5T+', label: 'Capital at risk', sub: 'Global cost overruns annually' },
  { value: '6–12 mo', label: 'Signal lag', sub: 'Typical intelligence delay, emerging markets' },
  { value: '$200k/yr', label: 'Incumbent cost', sub: 'Top-tier vendor pricing vs. InfradarAI from $0' },
];

const FLAWS = [
  'Annual PDF reports with zero real-time updates',
  'Human analysts as bottleneck - research takes weeks',
  'No confidence scoring - reliability is unknown',
  'Sector-siloed: energy OR transport, never integrated',
  'No early warning - you learn about delays after they happen',
  'Pricing excludes the mid-market entirely',
];

export function ProblemSection() {
  return (
    <section id="problem" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="font-serif text-3xl font-bold sm:text-4xl max-w-2xl">
          Infrastructure intelligence is broken
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
          Incumbents sell tools from 2005 at 2025 prices. Stale data, conflicting signals, and manual workflows cost decision-makers weeks when the market moves in hours.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass-panel rounded-xl p-8 text-center"
            >
              <div className="text-4xl font-serif font-bold text-gradient-teal">{s.value}</div>
              <div className="mt-2 font-medium">{s.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 glass-panel rounded-xl p-6 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">What incumbents get wrong</p>
          <ul className="grid sm:grid-cols-2 gap-2">
            {FLAWS.map(f => (
              <li key={f} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-destructive/60 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
