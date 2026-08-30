import { CONNECTED_FLOW } from '@/content';
import { Section } from '../layout/Section';
import { Eyebrow } from '../ui/Eyebrow';
import { DisplayHeading } from '../ui/DisplayHeading';
import { SectionCta } from '../ui/SectionCta';

export function ConnectedFlowSection() {
  return (
    <Section band="navy" id="how">
      <div className="flex max-w-[640px] flex-col gap-4">
        <Eyebrow onDark>{CONNECTED_FLOW.eyebrow}</Eyebrow>
        <DisplayHeading className="text-white">{CONNECTED_FLOW.heading}</DisplayHeading>
      </div>

      {/* Desktop: horizontal rail. Mobile: vertical list. */}
      <ol
        data-flow
        className="relative mt-14 hidden grid-cols-6 md:grid"
      >
        <span
          className="absolute left-[8%] right-[8%] top-[18px] h-0.5 bg-white/[0.16]"
          aria-hidden
        />
        {CONNECTED_FLOW.steps.map((step, i) => (
          <li
            key={step}
            className="relative flex flex-col items-center gap-3.5 px-2 text-center"
          >
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-primary text-[15px] font-bold text-white">
              {i + 1}
            </span>
            <p className="max-w-[150px] text-[13.5px] text-on-navy-soft">{step}</p>
          </li>
        ))}
      </ol>

      <ol className="mt-10 flex flex-col gap-3.5 md:hidden">
        {CONNECTED_FLOW.steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3">
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white">
              {i + 1}
            </span>
            <p className="min-w-0 pt-1 text-[14px] text-on-navy-soft">{step}</p>
          </li>
        ))}
      </ol>

      <p className="mt-10 text-[14px] text-on-navy-dim">{CONNECTED_FLOW.closer}</p>

      <SectionCta section="connected-flow" />
    </Section>
  );
}
