import { GROWTH } from '@/content';
import { Section } from '../layout/Section';
import { SectionHeader } from '../ui/SectionHeader';
import { SectionCta } from '../ui/SectionCta';
import { Card } from '../ui/Card';
import { Icon, type IconName } from '../ui/Icon';
import { Bullet } from '../ui/Bullet';
import { ScreenshotFrame } from '../ui/ScreenshotFrame';

export function GrowthSection() {
  return (
    <Section band="stone" id="sell-more">
      <SectionHeader
        eyebrow={GROWTH.eyebrow}
        heading={GROWTH.heading}
        lead={GROWTH.lead}
      />

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {GROWTH.cards.map((card) => (
          <Card key={card.title} className="flex flex-col gap-3">
            <Icon name={card.icon as IconName} className="text-primary" />
            <p className="text-[19px] font-bold leading-tight tracking-[-0.02em] text-navy">
              {card.title}
            </p>
            <p className="text-[16px] text-muted">{card.body}</p>
          </Card>
        ))}
      </div>

      <div className="mt-14 grid items-center gap-12 md:grid-cols-2">
        <ScreenshotFrame
          tab="Stocdup · Customer"
          label={GROWTH.screenshotLabel}
          variant="catalogue"
        />
        <div className="flex flex-col gap-4">
          <p className="text-[19px] font-bold tracking-[-0.02em] text-navy">
            {GROWTH.controlTitle}
          </p>
          <ul className="flex flex-col gap-2.5">
            {GROWTH.controlPoints.map((p) => (
              <Bullet key={p}>{p}</Bullet>
            ))}
          </ul>
          <p className="text-[14px] text-muted">{GROWTH.controlNote}</p>
        </div>
      </div>

      <SectionCta section="growth" />
    </Section>
  );
}
