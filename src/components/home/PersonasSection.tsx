import { motion } from 'framer-motion';
import { DollarSign, Compass, BarChart3, Search } from 'lucide-react';

const PERSONAS = [
  { icon: DollarSign, role: 'Investors & CFOs', use: 'Investment due diligence', bullets: ['Shorten diligence cycles', 'Verify project readiness', 'Surface risk flags early'] },
  { icon: Compass, role: 'Strategy leaders', use: 'Market opportunity analysis', bullets: ['Map emerging markets', 'Track competitor pipelines', 'Identify partnership signals'] },
  { icon: BarChart3, role: 'Project leaders', use: 'Portfolio risk monitoring', bullets: ['Real-time delay alerts', 'Automated delay detection', 'Cross-portfolio visibility'] },
  { icon: Search, role: 'Business development', use: 'Competitive intelligence', bullets: ['Map stakeholder networks', 'Track bid activity', 'Optimize outreach timing'] },
];

export function PersonasSection() {
  return (
    <section id="personas" className="relative py-24">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 80%, rgba(107,216,203,0.05) 0%, transparent 70%)' }} />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">05 Built for your role</div>
        <h2 className="font-serif text-3xl font-bold sm:text-4xl">One engine, four ways to win</h2>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PERSONAS.map((p, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="glass-panel rounded-xl p-6 hover:border-primary/30 transition-colors">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-lg font-semibold">{p.role}</h3>
              <p className="text-sm text-primary mt-1 mb-3">{p.use}</p>
              <ul className="space-y-1.5">
                {p.bullets.map(b => <li key={b} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary mt-1.5 h-1 w-1 rounded-full bg-primary shrink-0" />{b}</li>)}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
