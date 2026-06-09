import { motion } from 'framer-motion';
import { Activity, ShieldCheck, Globe, AlertTriangle, FileText, HardHat, TrendingDown, Search, Sparkles } from 'lucide-react';

const MODULES = [
  { icon: Activity, title: 'Real-time project monitoring', desc: 'Live tracking of project milestones, delays, and status changes across your portfolio.' },
  { icon: ShieldCheck, title: 'Multi-source verification', desc: 'Cross-reference satellite imagery labels, filings, news, registries, and partner data to build a multi-dimensional evidence base for every project.', wide: true },
  { icon: ShieldCheck, title: 'Multi-source validation', desc: 'Cross-reference filings, news, registries, and partner data to eliminate false signals.' },
  { icon: Globe, title: 'Geospatial intelligence', desc: 'Map-based situational awareness with location-enriched project and risk overlays.' },
  { icon: TrendingDown, title: 'Delay prediction and early warning', desc: 'Composite project health score combining risk, confidence decay, funding gaps, and recent alerts — surface projects trending toward delay before it hits your timeline.' },
  { icon: HardHat, title: 'Contractor intelligence', desc: 'Track which firms win bids globally. Get alerts when contractors on your portfolio show financial distress before it becomes a project crisis.' },
  { icon: AlertTriangle, title: 'Risk and anomaly signals', desc: 'Automated detection of cost overruns, timeline drift, permit denials, and political risk indicators across 9 signal categories.' },
  { icon: Search, title: 'Procurement monitoring (20+ sources)', desc: 'Tenders from multilateral banks, national procurement portals, and UN agencies - surface opportunities before competitors find them.', wide: true },
  { icon: FileText, title: 'AI market reports', desc: 'Generate country, sector, tender, and portfolio briefs from live projects, alerts, confidence scores, and source citations.' },
  { icon: Sparkles, title: 'Ask in plain English', desc: 'Skip the filter forms. Ask "renewable energy projects in West Africa above $100M in tender stage" and get instant, ranked results powered by AI-driven query translation.', wide: true },
];

export function CapabilitiesSection() {
  return (
    <section id="services" className="relative py-24">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 80% 30%, rgba(107,216,203,0.06) 0%, transparent 70%)' }} />
      <div className="relative section-fluid">
        <h2 className="font-serif text-3xl font-bold sm:text-4xl max-w-2xl">
          Monitoring, verification, and <em className="not-italic text-gradient-teal">market intelligence</em>
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">
          Verified signals, real-time updates, confidence scoring, AI Q&amp;A, and report-quality intelligence across all continents.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className={`glass-panel rounded-xl p-6 group hover:border-primary/30 transition-colors ${m.wide ? 'sm:col-span-2 lg:col-span-1' : ''}`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
                <m.icon className="h-4 w-4" />
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
