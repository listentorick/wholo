import { ANY_SCALE } from '@/content';
import { Section } from '../layout/Section';
import { SectionHeader } from '../ui/SectionHeader';
import { SectionCta } from '../ui/SectionCta';
import { Card } from '../ui/Card';
import { Icon, type IconName } from '../ui/Icon';
import { Reveal } from '../motion/Reveal';

export function AnyScaleSection() {
  return (
    <Section band="stone">
      <SectionHeader
        eyebrow={ANY_SCALE.eyebrow}
        heading={ANY_SCALE.heading}
        lead={ANY_SCALE.lead}
      />
      <Reveal className="mt-12 grid gap-5 md:grid-cols-3" stagger={0.09}>
        {ANY_SCALE.cards.map((card) => (
          <Card key={card.title} className="flex h-full flex-col gap-3">
            <Icon name={card.icon as IconName} className="text-primary" />
            <p className="text-[19px] font-bold leading-tight tracking-[-0.02em] text-navy">
              {card.title}
            </p>
            <p className="text-[16px] text-muted">{card.body}</p>
          </Card>
        ))}
      </Reveal>
      <SectionCta section="any-scale" />
    </Section>
  );
}
