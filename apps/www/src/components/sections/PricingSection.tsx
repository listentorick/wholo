import { PRICING } from '@/content';
import { Section } from '../layout/Section';
import { Eyebrow } from '../ui/Eyebrow';
import { DisplayHeading } from '../ui/DisplayHeading';
import { Card } from '../ui/Card';
import { Cta } from '../ui/Cta';
import { Bullet } from '../ui/Bullet';

export function PricingSection() {
  return (
    <Section band="white">
      <div className="grid items-center gap-14 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Eyebrow>{PRICING.eyebrow}</Eyebrow>
          <DisplayHeading className="text-navy">{PRICING.heading}</DisplayHeading>
          <p className="max-w-[640px] text-[18.5px] leading-[1.62] text-muted">
            {PRICING.lead}
          </p>
          <div className="mt-1">
            <Cta section="pricing" />
          </div>
        </div>

        <Card className="flex flex-col gap-3.5 bg-offwhite">
          <p className="text-[19px] font-bold tracking-[-0.02em] text-navy">
            {PRICING.cardTitle}
          </p>
          <ul className="flex flex-col gap-3">
            {PRICING.cardPoints.map((p) => (
              <Bullet key={p}>{p}</Bullet>
            ))}
          </ul>
          <p className="mt-1 text-[13px] text-muted">{PRICING.disclaimer}</p>
        </Card>
      </div>
    </Section>
  );
}
