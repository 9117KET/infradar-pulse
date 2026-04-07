import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { COVERAGE_PILLARS } from '@/data/coverage';

/**
 * Landing "Coverage" grid: ten pillars mapped to project_sector values (see data/coverage.ts).
 */
export function CoverageSection() {
  return (
    <section className="relative py-24 border-t border-border/40">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 40% at 20% 60%, rgba(107,216,203,0.05) 0%, transparent 65%)' }} />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">Coverage</div>
        <h2 className="font-serif text-3xl font-bold sm:text-4xl text-foreground mb-4">Coverage</h2>
        <p className="max-w-2xl text-muted-foreground leading-relaxed mb-12">
          Project types we track across the pipeline. Each category maps to structured sector tags in the platform.
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          {COVERAGE_PILLARS.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
            >
              <Link
                to="/#demo"
                className="glass-panel rounded-xl p-6 flex gap-4 h-full hover:border-primary/30 transition-colors group"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <p.icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <h3 className="font-serif text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                    {p.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{p.description}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
