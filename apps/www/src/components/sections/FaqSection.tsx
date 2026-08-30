import { FAQ } from '@/content';
import { Section } from '../layout/Section';
import { DisplayHeading } from '../ui/DisplayHeading';
import { SectionCta } from '../ui/SectionCta';
import { Reveal } from '../motion/Reveal';

export function FaqSection() {
  return (
    <Section band="white">
      <Reveal>
        <DisplayHeading className="max-w-[640px] text-navy">{FAQ.heading}</DisplayHeading>
      </Reveal>
      <Reveal className="mt-12" y={16}>
        <dl className="grid gap-x-14 gap-y-9 md:grid-cols-2">
          {FAQ.items.map((item) => (
            <div key={item.q} className="flex flex-col gap-2">
              <dt className="text-[16.5px] font-bold tracking-[-0.02em] text-navy">
                {item.q}
              </dt>
              <dd className="text-[16px] text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
      <SectionCta section="faq" />
    </Section>
  );
}
