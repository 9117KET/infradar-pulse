import { Activity, Satellite, ShieldCheck, Globe, AlertTriangle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { CapabilitiesSection } from '@/components/home/CapabilitiesSection';
import { PersonasSection } from '@/components/home/PersonasSection';
import { UseCaseSection } from '@/components/home/UseCaseSection';

const MODULES = [
  { icon: Activity, title: 'Real-time project monitoring', desc: 'Continuous tracking of infrastructure project milestones, delays, and status changes. Confidence-scored updates from 20+ verified sources.' },
  { icon: Satellite, title: 'Satellite verification', desc: 'Independent construction progress verification using commercial satellite imagery. Ground-truth confirmation for filed claims and contractor reports.' },
  { icon: ShieldCheck, title: 'Multi-source validation', desc: 'Cross-referencing government filings, news feeds, registry data, and partner intelligence to eliminate conflicting signals.' },
  { icon: Globe, title: 'Geospatial intelligence', desc: 'Interactive map-based analysis with location-enriched risk overlays, project clustering, and regional comparison tools.' },
  { icon: AlertTriangle, title: 'Risk and anomaly signals', desc: 'Automated detection of cost overruns, timeline drift, political risk factors, and supply chain disruptions.' },
  { icon: FileText, title: 'AI-powered market reports', desc: 'Country, sector, tender and portfolio briefs generated from live project data, alerts, confidence scores and citations.' },
];

export default function Services() {
  return (
    <>
      <div className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h1 className="font-serif text-4xl font-bold mb-4">Services</h1>
          <p className="text-muted-foreground max-w-2xl mb-12">Platform modules for business development teams, EPC contractors, project managers, infrastructure consultants, development finance analysts, project finance professionals, owners, developers, procurement teams, and organizations that need timely project and market intelligence across 14 regional coverage buckets.</p>

          <div className="grid gap-6 md:grid-cols-2 mb-12">
            {MODULES.map((m, i) => (
              <div key={i} className="glass-panel rounded-xl p-6 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><m.icon className="h-5 w-5" /></div>
                  <h3 className="font-serif text-lg font-semibold">{m.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CapabilitiesSection />
      <PersonasSection />
      <UseCaseSection />

      <div className="py-10">
        <div className="flex gap-4 justify-center">
          <a href="/#demo"><Button className="teal-glow">See the demo</Button></a>
          <Link to="/contact"><Button variant="outline">Contact us</Button></Link>
        </div>
      </div>
    </>
  );
}
