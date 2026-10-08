import Image from 'next/image';
import { PROTECT } from '@/content';
import { Section } from '../layout/Section';
import { SectionHeader } from '../ui/SectionHeader';
import { SectionCta } from '../ui/SectionCta';
import { Card } from '../ui/Card';
import { Icon, type IconName } from '../ui/Icon';
import { ScreenshotFrame } from '../ui/ScreenshotFrame';
import { Reveal } from '../motion/Reveal';

export function ProtectSection() {
  return (
    <Section band="stone" id="protect">
      <SectionHeader
        eyebrow={PROTECT.eyebrow}
        heading={PROTECT.heading}
        lead={PROTECT.lead}
      />

      <Reveal className="mt-12 grid gap-5 md:grid-cols-3" stagger={0.09}>
        {PROTECT.cards.map((card) => (
          <Card key={card.title} className="flex h-full flex-col gap-3">
            <Icon name={card.icon as IconName} className="text-primary" />
            <p className="text-[19px] font-bold leading-tight tracking-[-0.02em] text-navy">
              {card.title}
            </p>
            <p className="text-[16px] text-muted">{card.body}</p>
          </Card>
        ))}
      </Reveal>

      <Reveal className="mt-14">
        <div className="grid items-start gap-10 md:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <Image
              src="/screenshot2.png"
              alt={PROTECT.screenshotAlt}
              width={1183}
              height={670}
              sizes="(min-width: 768px) 50vw, 100vw"
              className="h-auto w-full"
            />
          </div>
          <ScreenshotFrame tab="Stocdup · Customer" label={PROTECT.customerScreenshotLabel} />
        </div>
        <p className="mt-4 text-[14px] text-muted">{PROTECT.note}</p>
      </Reveal>

      <SectionCta section="protect" />
    </Section>
  );
}
