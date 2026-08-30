import { cookies } from 'next/headers';
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
import type { HeroVariant } from '@/content';

// Hero A/B: set only when EXPERIMENT_HERO_VARIANTS names 2+ variants at build.
// When it does, `/` becomes per-request (reads the middleware-assigned cookie);
// otherwise it stays static on the default hero.
const EXPERIMENT = (process.env.EXPERIMENT_HERO_VARIANTS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isVariant(v: string | undefined): v is HeroVariant {
  return v === 'default' || v === 'growth' || v === 'operations';
}

export default async function HomePage() {
  let variant: HeroVariant = 'default';
  if (EXPERIMENT.length >= 2) {
    const c = (await cookies()).get('hero_variant')?.value;
    if (isVariant(c)) variant = c;
  }

  return (
    <>
      <Nav />
      <main id="main">
        <Hero variant={variant} />
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
        <RegisterSection variant={variant} />
      </main>
      <Footer />
    </>
  );
}
