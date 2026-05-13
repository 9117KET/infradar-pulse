import { HeroSection } from '@/components/home/HeroSection';
import { TrustStrip } from '@/components/home/TrustStrip';
import { DemoSection } from '@/components/home/DemoSection';
import { SectorSnapshotSection } from '@/components/home/SectorSnapshotSection';
import { Seo } from '@/components/Seo';

const Index = () => (
  <>
    <Seo
      title="InfradarAI | Verified Global Infrastructure Intelligence"
      description="Track high-value infrastructure projects across 14 global regions with AI-assisted, human-verified signals. Confidence-scored intelligence in hours, not weeks."
      path="/"
    />
    <HeroSection />
    <TrustStrip />
    <DemoSection />
    <SectorSnapshotSection />
  </>
);

export default Index;
