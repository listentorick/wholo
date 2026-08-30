import { FOUNDER } from '@/content';
import { Section } from '../layout/Section';
import { Eyebrow } from '../ui/Eyebrow';
import { DisplayHeading } from '../ui/DisplayHeading';
import { SectionCta } from '../ui/SectionCta';

export function FounderSection() {
  return (
    <Section band="stone">
      <div className="flex max-w-[760px] flex-col gap-[18px]">
        <Eyebrow>{FOUNDER.eyebrow}</Eyebrow>
        <DisplayHeading className="text-navy">{FOUNDER.heading}</DisplayHeading>
        {FOUNDER.paragraphs.map((p) => (
          <p key={p.slice(0, 24)} className="text-[17px] leading-[1.62] text-muted">
            {p}
          </p>
        ))}
        <p className="text-[14px] text-muted">{FOUNDER.signoff}</p>
      </div>
      <SectionCta section="founder" />
    </Section>
  );
}
