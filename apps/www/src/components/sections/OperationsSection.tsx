import { OPERATIONS } from '@/content';
import { Section } from '../layout/Section';
import { SectionHeader } from '../ui/SectionHeader';
import { SectionCta } from '../ui/SectionCta';
import { Icon, type IconName } from '../ui/Icon';
import { Reveal } from '../motion/Reveal';

export function OperationsSection() {
  return (
    <Section band="white" id="run-smoother">
      <SectionHeader
        eyebrow={OPERATIONS.eyebrow}
        heading={OPERATIONS.heading}
        lead={OPERATIONS.lead}
      />

      <Reveal className="mt-11 flex flex-col" stagger={0.12}>
        {OPERATIONS.rows.map((row, i) => (
          <div
            key={row.title}
            className={`grid gap-6 border-t border-border py-8 md:grid-cols-[230px_minmax(0,1fr)] md:gap-10 ${
              i === OPERATIONS.rows.length - 1 ? 'border-b' : ''
            }`}
          >
            <div className="flex flex-col gap-3">
              <Icon name={row.icon as IconName} className="text-primary" />
              <p className="text-[19px] font-bold leading-tight tracking-[-0.02em] text-navy">
                {row.title}
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="text-[16px] text-muted">{row.body}</p>
              <div className="mt-1 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
                {row.points.map((p) => (
                  <p key={p} className="text-[14px] text-muted">
                    · {p}
                  </p>
                ))}
              </div>
              {'note' in row && row.note && (
                <p className="mt-1.5 text-[14px] text-muted">{row.note}</p>
              )}
            </div>
          </div>
        ))}
      </Reveal>

      <SectionCta section="operations" />
    </Section>
  );
}
