import { EVIDENCE } from '@/content';
import { Section } from '../layout/Section';
import { SectionHeader } from '../ui/SectionHeader';
import { SectionCta } from '../ui/SectionCta';
import { ScreenshotFrame } from '../ui/ScreenshotFrame';

export function EvidenceSection() {
  return (
    <Section band="white" id="why">
      <SectionHeader
        eyebrow={EVIDENCE.eyebrow}
        heading={EVIDENCE.heading}
        lead={EVIDENCE.lead}
      />
      <div className="mt-12 grid gap-10 md:grid-cols-2">
        {EVIDENCE.shots.map((shot, i) => (
          <div key={shot.tab} className="flex flex-col gap-3.5">
            <ScreenshotFrame
              tab={shot.tab}
              label={shot.label}
              variant={i === 0 ? 'default' : 'runs'}
            />
            <p className="text-[16px] text-muted">
              <span className="font-bold text-navy">{shot.caption}</span> {shot.line}
            </p>
          </div>
        ))}
      </div>
      <SectionCta section="evidence" />
    </Section>
  );
}
