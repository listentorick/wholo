import { PRESSURE } from '@/content';
import { Section } from '../layout/Section';
import { SectionHeader } from '../ui/SectionHeader';
import { SectionCta } from '../ui/SectionCta';

export function PressureSection() {
  return (
    <Section band="white" id="pressure">
      <SectionHeader
        eyebrow={PRESSURE.eyebrow}
        heading={PRESSURE.heading}
        lead={PRESSURE.lead}
      />
      <p className="mt-6 text-[19px] font-bold tracking-[-0.02em] text-navy">{PRESSURE.closer}</p>
      <SectionCta section="pressure" />
    </Section>
  );
}
