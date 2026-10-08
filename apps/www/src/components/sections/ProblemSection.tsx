import { PROBLEM } from '@/content';
import { Section } from '../layout/Section';
import { SectionHeader } from '../ui/SectionHeader';
import { SectionCta } from '../ui/SectionCta';
import { Icon } from '../ui/Icon';
import { Reveal } from '../motion/Reveal';

export function ProblemSection() {
  return (
    <Section band="white" id="product">
      <SectionHeader
        eyebrow={PROBLEM.eyebrow}
        heading={PROBLEM.heading}
        lead={PROBLEM.lead}
        className="max-w-[680px]"
      />
      <Reveal className="mt-12" y={16}>
        <ul className="grid gap-6 sm:grid-cols-2 sm:gap-x-12">
          {PROBLEM.points.map((point) => (
            <li key={point.title} className="flex gap-3.5">
              <Icon
                name="close"
                strokeWidth={2.2}
                className="mt-0.5 h-5 w-5 shrink-0 text-amber"
              />
              <p className="min-w-0 text-[16px] text-muted">
                <span className="font-bold text-navy">{point.title}</span> {point.body}
              </p>
            </li>
          ))}
        </ul>
      </Reveal>
      <SectionCta section="problem" />
    </Section>
  );
}
