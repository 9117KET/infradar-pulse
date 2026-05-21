import { HeroSection } from '@/components/home/HeroSection';
import { TrustStrip } from '@/components/home/TrustStrip';
import { ProblemSection } from '@/components/home/ProblemSection';
import { CapabilitiesSection } from '@/components/home/CapabilitiesSection';
import { DemoSection } from '@/components/home/DemoSection';
import { CoverageSection } from '@/components/home/CoverageSection';
import { SectorSnapshotSection } from '@/components/home/SectorSnapshotSection';
import { PipelineSection } from '@/components/home/PipelineSection';
import { PersonasSection } from '@/components/home/PersonasSection';
import { UseCaseSection } from '@/components/home/UseCaseSection';
import { EngagementSection } from '@/components/home/EngagementSection';
import { Seo } from '@/components/Seo';

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
    <ProblemSection />
    <CapabilitiesSection />
    <DemoSection />
    <CoverageSection />
    <SectorSnapshotSection />
    <PipelineSection />
    <PersonasSection />
    <UseCaseSection />
    <EngagementSection />
  </>
);

export default Index;
