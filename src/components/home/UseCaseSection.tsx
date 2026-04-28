import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

const CASES = [
  {
    label: 'Business development teams',
    title: 'Build qualified infrastructure pipeline faster',
    context: 'A regional growth team uses InfradarAI to identify active projects, map stakeholders, and prioritize outreach by sector, value, and timing.',
    flow: [
      { phase: 'Find', desc: 'Surface projects and tenders matching target sectors, regions, and ticket sizes.' },
      { phase: 'Qualify', desc: 'Review stakeholders, funding status, source evidence, and confidence scores.' },
      { phase: 'Act', desc: 'Save prospects to portfolio and trigger alerts when milestones change.' },
      { phase: 'Report', desc: 'Export market maps, target lists, and briefing notes for weekly pipeline reviews.' },
    ],
    metrics: [
      { label: 'Pipeline view', value: 'Live by region' },
      { label: 'Signals', value: 'Tenders + milestones' },
      { label: 'Output', value: 'Briefs and exports' },
    ],
  },
  {
    label: 'EPC contractors',
    title: 'Track tenders before competitors move',
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
  {
    label: 'Project managers',
    title: 'Monitor delivery risk across active projects',
    context: 'Project managers use InfradarAI to keep milestone, delay, contractor, and site-progress signals in one operating view instead of chasing fragmented updates.',
    flow: [
      { phase: 'Before', desc: 'Manual status chasing across emails, reports, public notices, and field updates.' },
      { phase: 'During', desc: 'Tracked milestones, risk alerts, project evidence, and contractor signals in one workspace.' },
      { phase: 'After', desc: 'Earlier escalation of slippage, procurement changes, and delivery bottlenecks.' },
      { phase: 'Impact', desc: 'Clearer reporting for leadership, lenders, owners, and delivery partners.' },
    ],
    metrics: [
      { label: 'Focus', value: 'Milestones + risk' },
      { label: 'Workflow', value: 'Alerts to reports' },
      { label: 'Users', value: 'Owners and PMOs' },
    ],
  },
  {
    label: 'Consultants and finance teams',
    title: 'Turn live data into market and diligence briefs',
    context: 'Infrastructure consultants, development finance analysts, and project finance professionals use verified project intelligence to support market entry, diligence, portfolio monitoring, and risk reviews.',
    flow: [
      { phase: 'Scope', desc: 'Filter countries, sectors, funders, stages, values, and risk patterns.' },
      { phase: 'Verify', desc: 'Check source URLs, confidence scores, and audit trails before using findings.' },
      { phase: 'Analyze', desc: 'Ask AI questions across selected portfolios and market segments.' },
      { phase: 'Deliver', desc: 'Generate report-quality summaries, tearsheets, and exportable datasets.' },
    ],
    metrics: [
      { label: 'Coverage', value: '14 regions' },
      { label: 'Evidence', value: 'Source-backed' },
      { label: 'Deliverable', value: 'Reports + data' },
    ],
  },
];

export function UseCaseSection() {
  return (
    <section id="work" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="font-serif text-3xl font-bold sm:text-4xl max-w-2xl">How infrastructure teams use InfradarAI</h2>
        <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
          From business development teams and infrastructure consultants building market maps to EPC contractors, project managers, development finance analysts, project finance professionals, owners, developers, and procurement teams monitoring tenders, delivery, portfolios, and risk - one platform, multiple workflows.
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
