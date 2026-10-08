import Image from 'next/image';
import { GROWTH } from '@/content';
import { Section } from '../layout/Section';
import { SectionHeader } from '../ui/SectionHeader';
import { SectionCta } from '../ui/SectionCta';
import { Card } from '../ui/Card';
import { Icon, type IconName } from '../ui/Icon';
import { Bullet } from '../ui/Bullet';
import { Reveal } from '../motion/Reveal';

export function GrowthSection() {
  return (
    <Section band="white" id="sell-more">
      <SectionHeader
        eyebrow={GROWTH.eyebrow}
        heading={GROWTH.heading}
        lead={GROWTH.lead}
      />

      <Reveal className="mt-12 grid gap-5 md:grid-cols-2" stagger={0.09}>
        {GROWTH.cards.map((card) => (
          <Card key={card.title} className="flex h-full flex-col gap-3">
            <Icon name={card.icon as IconName} className="text-primary" />
            <p className="text-[19px] font-bold leading-tight tracking-[-0.02em] text-navy">
              {card.title}
            </p>
            <p className="text-[16px] text-muted">{card.body}</p>
          </Card>
        ))}
      </Reveal>

      <Reveal className="mt-14 grid items-center gap-12 md:grid-cols-2">
        {/*
          The screenshot is the whole page (2064 x 5702). Show only the banner and the first row of
          products: 2140px of it, starting 84px down (below the staff-only "ordering on behalf of" bar).
          A percentage margin is relative to the frame's width, so -84/2064 lifts exactly that bar out.
        */}
        <div className="aspect-[2064/2140] overflow-hidden rounded-lg border border-border bg-white">
          <Image
            src="/screenshot7.png"
            alt={GROWTH.screenshotAlt}
            width={2064}
            height={5702}
            sizes="(min-width: 768px) 50vw, 100vw"
            className="-mt-[4.07%] h-auto w-full"
          />
        </div>
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
      </Reveal>

      <SectionCta section="growth" />
    </Section>
  );
}
