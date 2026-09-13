import { HeroSection } from '@/components/home/HeroSection';
import { TrustStrip } from '@/components/home/TrustStrip';
import { ProblemSection } from '@/components/home/ProblemSection';
import { DemoSection } from '@/components/home/DemoSection';
import { PipelineSection } from '@/components/home/PipelineSection';
import { EngagementSection } from '@/components/home/EngagementSection';
import { Seo } from '@/components/Seo';
import { Suspense, lazy } from 'react';

// Recharts is ~420KB; keep it out of the landing page's initial download.
const SectorSnapshotSection = lazy(() =>
  import('@/components/home/SectorSnapshotSection').then((m) => ({ default: m.SectorSnapshotSection })),
);
// Capabilities, Coverage, Personas, and UseCase sections moved to /services to keep
// the homepage scannable; they were also previously duplicated there. See Services.tsx.

const Index = () => (
  <>
    <Seo
      title="InfradarAI | Verified Global Infrastructure Intelligence"
      description="Track high-value infrastructure projects across 14 global regions with AI-assisted, human-verified signals. Confidence-scored intelligence in hours, not weeks."
      path="/"
      jsonLd={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'InfradarAI',
        url: 'https://infradarai.com',
        description: 'AI-assisted, human-verified global infrastructure intelligence platform tracking high-value projects across 14 global regions.',
        sameAs: [],
      }}
    />
    <HeroSection />
    <TrustStrip />
    <ProblemSection showFlaws={false} />
    <DemoSection />
    <Suspense fallback={<div className="h-[420px]" />}>
      <SectorSnapshotSection />
    </Suspense>
    <PipelineSection showFeatures={false} />
    <EngagementSection />
  </>
);

export default Index;
