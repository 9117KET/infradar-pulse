import { motion } from 'framer-motion';

const STATS = [
  { value: '85%', label: 'Projects delayed', sub: 'Major programs' },
  { value: '$1.5T+', label: 'Capital at risk', sub: 'Cost overruns' },
  { value: '6–12 mo', label: 'Signal lag', sub: 'Emerging markets' },
];

export function ProblemSection() {
  return (
    <section id="problem" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">01 Problem</div>
        <h2 className="font-serif text-3xl font-bold sm:text-4xl max-w-2xl">
          Fragmented intelligence slows every high-stakes call
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
          Stale data, conflicting signals, and manual workflows cost decision-makers weeks when the market moves in hours.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
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
      </div>
    </section>
  );
}
