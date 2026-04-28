import { motion } from 'framer-motion';
import { Activity, Satellite, ShieldCheck, Globe, AlertTriangle, FileText, HardHat, TrendingDown, Search, Sparkles } from 'lucide-react';

const MODULES = [
  { icon: Activity, title: 'Real-time project monitoring', desc: 'Live tracking of project milestones, delays, and status changes across your portfolio.', label: 'Module 01' },
  { icon: Satellite, title: 'Satellite verification', desc: 'Independent construction progress confirmation via satellite imagery analysis - ground truth no analyst can fake.', label: 'Module 02', wide: true },
  { icon: ShieldCheck, title: 'Multi-source validation', desc: 'Cross-reference filings, news, registries, and partner data to eliminate false signals.', label: 'Module 03' },
  { icon: Globe, title: 'Geospatial intelligence', desc: 'Map-based situational awareness with location-enriched project and risk overlays.', label: 'Module 04' },
  { icon: TrendingDown, title: 'Delay prediction and early warning', desc: 'AI-powered signals 6-9 months ahead: contractor health, permit timelines, political calendars, and funding gaps combined into a single project health score.', label: 'Module 05' },
  { icon: HardHat, title: 'Contractor intelligence', desc: 'Track which firms win bids globally. Get alerts when contractors on your portfolio show financial distress before it becomes a project crisis.', label: 'Module 06' },
  { icon: AlertTriangle, title: 'Risk and anomaly signals', desc: 'Automated detection of cost overruns, timeline drift, permit denials, and political risk indicators across 9 signal categories.', label: 'Module 07' },
  { icon: Search, title: 'Procurement monitoring (20+ sources)', desc: 'Tenders from multilateral banks, national procurement portals, and UN agencies - surface opportunities before competitors find them.', label: 'Module 08', wide: true },
  { icon: FileText, title: 'AI market reports', desc: 'Generate country, sector, tender, and portfolio briefs from live projects, alerts, confidence scores, and source citations.', label: 'Module 09' },
  { icon: Sparkles, title: 'Ask in plain English', desc: 'Skip the filter forms. Ask "renewable energy projects in West Africa above $100M in tender stage" and get instant, ranked results powered by AI-driven query translation.', label: 'Module 10', wide: true },
];

export function CapabilitiesSection() {
  return (
    <section id="services" className="relative py-24">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 80% 30%, rgba(107,216,203,0.06) 0%, transparent 70%)' }} />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="font-serif text-3xl font-bold sm:text-4xl max-w-2xl">
          <em className="not-italic text-gradient-teal">Modern</em> infrastructure intelligence
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
          Verified signals, real-time updates, confidence scoring, AI Q&amp;A, and report-quality intelligence across all continents.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className={`glass-panel rounded-xl p-6 group hover:border-primary/30 transition-colors ${m.wide ? 'sm:col-span-2 lg:col-span-1' : ''}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <m.icon className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{m.label}</span>
              </div>
              <h3 className="font-serif text-lg font-semibold mb-2">{m.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{m.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
