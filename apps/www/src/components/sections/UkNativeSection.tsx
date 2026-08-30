import { UK_NATIVE } from '@/content';
import { Section } from '../layout/Section';
import { SectionHeader } from '../ui/SectionHeader';
import { SectionCta } from '../ui/SectionCta';
import { Card } from '../ui/Card';

export function UkNativeSection() {
  return (
    <Section band="stone">
      <SectionHeader
        eyebrow={UK_NATIVE.eyebrow}
        heading={UK_NATIVE.heading}
        lead={UK_NATIVE.lead}
      />
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {UK_NATIVE.points.map((point) => (
          <Card key={point} as="li" className="p-[22px]">
            <p className="text-[14.5px] font-semibold text-navy">{point}</p>
          </Card>
        ))}
      </ul>
      <p className="mt-6 text-[14px] text-muted">{UK_NATIVE.closer}</p>
      <SectionCta section="uk-native" />
    </Section>
  );
}
