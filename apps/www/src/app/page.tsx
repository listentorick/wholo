import { Nav } from '@/components/layout/Nav';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { ProofStrip } from '@/components/sections/ProofStrip';
import { ProblemSection } from '@/components/sections/ProblemSection';
import { GrowthSection } from '@/components/sections/GrowthSection';
import { OperationsSection } from '@/components/sections/OperationsSection';
import { AnyScaleSection } from '@/components/sections/AnyScaleSection';
import { ConnectedFlowSection } from '@/components/sections/ConnectedFlowSection';
import { EvidenceSection } from '@/components/sections/EvidenceSection';
import { UkNativeSection } from '@/components/sections/UkNativeSection';
import { PricingSection } from '@/components/sections/PricingSection';
import { FounderSection } from '@/components/sections/FounderSection';
import { FaqSection } from '@/components/sections/FaqSection';
import { RegisterSection } from '@/components/sections/RegisterSection';

export default function HomePage() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero variant="default" />
        <ProofStrip />
        <ProblemSection />
        <GrowthSection />
        <OperationsSection />
        <AnyScaleSection />
        <ConnectedFlowSection />
        <EvidenceSection />
        <UkNativeSection />
        <PricingSection />
        <FounderSection />
        <FaqSection />
        <RegisterSection />
      </main>
      <Footer />
    </>
  );
}
