import { Seo } from '@/components/Seo';

export default function Careers() {
  return (
    <div className="py-20">
      <Seo
        title="Careers | InfradarAI"
        description="Join InfradarAI to build the verified intelligence layer for global infrastructure. We're always interested in exceptional people in data, geospatial intelligence and emerging markets."
        path="/careers"
      />
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h1 className="font-serif text-4xl font-bold mb-4">Careers</h1>
        <p className="text-muted-foreground mb-8">We're building the intelligence layer for emerging-market infrastructure. Join us.</p>
        <div className="glass-panel rounded-xl p-8 text-center">
          <p className="text-muted-foreground mb-4">We're not actively hiring at this time, but we're always interested in hearing from exceptional people working at the intersection of data, geospatial intelligence, and emerging markets.</p>
          <a href="/contact" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">Get in touch</a>
        </div>
      </div>
    </div>
  );
}
