import { InfradarLogo } from '@/components/InfradarLogo';

export default function About() {
  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h1 className="font-serif text-4xl font-bold mb-4">About Infradar</h1>
        <div className="flex items-center gap-3 mb-8"><InfradarLogo size={40} /><span className="font-serif text-xl font-semibold tracking-wide">INFRADAR</span></div>
        <div className="prose prose-invert max-w-none space-y-4 text-muted-foreground">
          <p>Infradar delivers verified infrastructure intelligence for decision-makers operating across MENA and Africa—two of the world's fastest-growing infrastructure markets.</p>
          <p>We combine AI-assisted data enrichment with human-verified signals to produce confidence-scored, decision-ready intelligence. Our pipeline ingests from 20+ sources including government registries, satellite imagery, news feeds, and partner data networks.</p>
          <p>Our mission is to close the signal gap in emerging-market infrastructure: replacing fragmented spreadsheets and stale reports with a continuously verified pipeline that moves at the speed of capital.</p>
          <h2 className="font-serif text-2xl font-bold text-foreground mt-8">Our approach</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Multi-source collection from tenders, filings, registries, and partner feeds</li>
            <li>Satellite-verified construction milestones</li>
            <li>Agentic enrichment with human-in-the-loop validation</li>
            <li>Confidence scoring and provenance tracking on every data point</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
