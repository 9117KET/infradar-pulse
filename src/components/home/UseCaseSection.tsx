import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

const METRICS = [
  { label: 'Verification speed', value: 'Hours, not weeks' },
  { label: 'Coverage', value: 'Global' },
  { label: 'Signal quality', value: 'Confidence scored' },
  { label: 'Decision cadence', value: 'Weekly pipeline' },
];

const CHANGES = [
  '20+ sources ingested automatically',
  'Satellite verification for construction milestones',
  'Automated alerts on delay and risk signals',
  'Confidence scoring on every project record',
  'Decision-ready reports in hours',
];

export function UseCaseSection() {
  return (
    <section id="work" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">06 Use case spotlight</div>
        <h2 className="font-serif text-3xl font-bold sm:text-4xl max-w-2xl">Regional infrastructure fund</h2>
        <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
          A sovereign wealth fund managing $8B in African infrastructure replaced fragmented spreadsheets with unified, verified signals.
        </p>

        {/* Flow */}
        <div className="mt-12 grid gap-4 sm:grid-cols-4">
          {[
            { phase: 'Before', desc: 'Spreadsheets, manual calls, 2–3 week signal lag across 12 markets.' },
            { phase: 'During', desc: 'Onboarded Infradar pipeline with satellite verification and multi-source ingestion.' },
            { phase: 'After', desc: 'Unified signal dashboard, automated alerts, weekly confidence-scored pipeline reviews.' },
            { phase: 'Impact', desc: 'Reduced diligence cycle from 6 weeks to 5 days. Caught 3 delay risks before competitors.' },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="glass-panel rounded-xl p-5">
              <div className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">{s.phase}</div>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Metric chips */}
        <div className="mt-8 flex flex-wrap gap-3">
          {METRICS.map(m => (
            <Badge key={m.label} variant="outline" className="border-primary/30 text-sm py-1.5 px-3">
              <span className="text-primary font-semibold mr-1">{m.label}:</span> {m.value}
            </Badge>
          ))}
        </div>

        {/* What changed */}
        <div className="mt-8 glass-panel rounded-xl p-6 max-w-xl">
          <h3 className="font-serif text-lg font-semibold mb-3">What changed</h3>
          <ul className="space-y-2">
            {CHANGES.map(c => <li key={c} className="text-sm text-muted-foreground flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />{c}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
