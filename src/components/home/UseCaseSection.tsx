import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

const CASES = [
  {
    label: 'Case A - DFI portfolio team',
    title: 'Regional infrastructure fund',
    context: 'A sovereign wealth fund managing $8B in African infrastructure replaced fragmented spreadsheets with unified, verified signals.',
    flow: [
      { phase: 'Before', desc: 'Spreadsheets, manual calls, 2-3 week signal lag across 12 markets.' },
      { phase: 'During', desc: 'Onboarded InfradarAI with satellite verification and multi-source ingestion.' },
      { phase: 'After', desc: 'Unified signal dashboard, automated alerts, weekly confidence-scored pipeline reviews.' },
      { phase: 'Impact', desc: 'Reduced diligence cycle from 6 weeks to 5 days. Caught 3 delay risks before competitors.' },
    ],
    metrics: [
      { label: 'Diligence cycle', value: '6 weeks to 5 days' },
      { label: 'Signal lag', value: 'Real-time vs. 3 weeks' },
      { label: 'Cost vs. incumbents', value: '97% less' },
    ],
  },
  {
    label: 'Case B - EPC contractor',
    title: 'Global engineering contractor',
    context: 'An EPC contractor active in MENA and East Africa used InfradarAI to surface tender opportunities ahead of competitors and track project health across 40+ active sites.',
    flow: [
      { phase: 'Before', desc: 'Relying on informal networks and legacy regional intelligence subscriptions for tender coverage.' },
      { phase: 'During', desc: 'Configured InfradarAI for MENA tenders by sector and value threshold, with contractor win-rate tracking.' },
      { phase: 'After', desc: 'Real-time tender alerts, stakeholder maps, and competitor bid activity across 20+ procurement portals.' },
      { phase: 'Impact', desc: 'Identified $2.1B in tenders not covered by previous sources. Reduced tender research time by 80%.' },
    ],
    metrics: [
      { label: 'Tender sources', value: '20+ portals automated' },
      { label: 'Research time', value: '80% reduction' },
      { label: 'New pipeline found', value: '$2.1B identified' },
    ],
  },
];

export function UseCaseSection() {
  return (
    <section id="work" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="font-serif text-3xl font-bold sm:text-4xl max-w-2xl">How infrastructure teams use InfradarAI</h2>
        <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
          From business development teams and infrastructure consultants building market maps to EPC contractors, development finance analysts, and project finance professionals monitoring tenders, portfolios, and risk - one platform, multiple workflows.
        </p>

        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          {CASES.map((c, ci) => (
            <motion.div key={ci} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: ci * 0.15 }}>
              <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">{c.label}</div>
              <h3 className="font-serif text-xl font-bold mb-2">{c.title}</h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{c.context}</p>

              <div className="grid grid-cols-2 gap-3 mb-5">
                {c.flow.map((s, i) => (
                  <div key={i} className="glass-panel rounded-xl p-4">
                    <div className="text-xs font-semibold uppercase tracking-widest text-primary mb-1.5">{s.phase}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {c.metrics.map(m => (
                  <Badge key={m.label} variant="outline" className="border-primary/30 text-xs py-1.5 px-3">
                    <span className="text-primary font-semibold mr-1">{m.label}:</span> {m.value}
                  </Badge>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
