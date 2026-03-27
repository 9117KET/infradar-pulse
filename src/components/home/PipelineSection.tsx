import { motion } from 'framer-motion';
import { Download, ShieldCheck, Brain, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const STEPS = [
  { num: '01', title: 'Collection', desc: 'Ingest tenders, registries, filings, and partner feeds from 20+ sources.', icon: Download },
  { num: '02', title: 'Verification', desc: 'Satellite cues and multi-source consistency checks eliminate noise.', icon: Eye },
  { num: '03', title: 'Analysis', desc: 'Agentic enrichment, entity graph updates, and anomaly detection.', icon: Brain },
  { num: '04', title: 'Intelligence', desc: 'Confidence scores, provenance chains, and decision-ready views.', icon: ShieldCheck },
];

const FEATURES = [
  { title: 'Continuous pipeline monitoring', tags: ['Live signals', 'Confidence scoring', 'Risk indicators'] },
  { title: 'API command center', cta: true },
  { title: 'Governance-ready data handling', desc: 'End-to-end TLS encryption, role-based access, and audit trails for compliance.' },
];

export function PipelineSection() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">04 Pipeline</div>
        <h2 className="font-serif text-3xl font-bold sm:text-4xl max-w-2xl">From signals to decisions</h2>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="glass-panel rounded-xl p-6 relative group hover:border-primary/30 transition-colors">
              <div className="text-4xl font-serif font-bold text-white/5 absolute top-3 right-4">{s.num}</div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                <s.icon className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-lg font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={i} className="glass-panel rounded-xl p-6">
              <h3 className="font-serif text-lg font-semibold mb-3">{f.title}</h3>
              {f.tags && <div className="flex flex-wrap gap-2">{f.tags.map(t => <Badge key={t} variant="outline" className="text-xs border-primary/30 text-primary">{t}</Badge>)}</div>}
              {f.cta && <Link to="/contact"><Button size="sm" variant="outline" className="mt-3 text-xs">Explore docs</Button></Link>}
              {f.desc && <p className="text-sm text-muted-foreground">{f.desc}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
