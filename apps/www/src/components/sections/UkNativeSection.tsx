import Image from 'next/image';
import { UK_NATIVE } from '@/content';
import { Section } from '../layout/Section';
import { SectionHeader } from '../ui/SectionHeader';
import { SectionCta } from '../ui/SectionCta';
import { Card } from '../ui/Card';
import { Reveal } from '../motion/Reveal';

export function UkNativeSection() {
  return (
    <Section band="white" id="why">
      <SectionHeader
        eyebrow={UK_NATIVE.eyebrow}
        heading={UK_NATIVE.heading}
        lead={UK_NATIVE.lead}
      />
      <Reveal className="mt-12 grid gap-10 md:grid-cols-3" stagger={0.12}>
        {UK_NATIVE.shots.map((shot) => (
          <div key={shot.tab} className="flex flex-col gap-3.5">
            <div className="overflow-hidden rounded-lg border border-border bg-white">
              <Image
                src={shot.image.src}
                alt={shot.image.alt}
                width={shot.image.width}
                height={shot.image.height}
                sizes="(min-width: 768px) 33vw, 100vw"
                className="h-auto w-full"
              />
            </div>
            <p className="text-[16px] text-muted">
              <span className="font-bold text-navy">{shot.caption}</span> {shot.line}
            </p>
          </div>
        ))}
      </Reveal>
      <Reveal className="mt-12" y={16}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {UK_NATIVE.points.map((point) => (
            <Card key={point} as="li" className="p-[22px]">
              <p className="text-[14.5px] font-semibold text-navy">{point}</p>
            </Card>
          ))}
        </ul>
      </Reveal>
      <p className="mt-6 text-[14px] text-muted">{UK_NATIVE.closer}</p>
      <SectionCta section="uk-native" />
    </Section>
  );
}
