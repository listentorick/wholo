import { Fragment } from 'react';
import { HERO, HERO_CREDIBILITY, type HeroVariant } from '@/content';
import { Section } from '../layout/Section';
import { Eyebrow } from '../ui/Eyebrow';
import { DisplayHeading } from '../ui/DisplayHeading';
import { Mark } from '../ui/Mark';
import { Cta } from '../ui/Cta';
import { GhostButton } from '../ui/GhostButton';
import { ScreenshotFrame } from '../ui/ScreenshotFrame';

function renderHeadline(lines: readonly string[], markLine?: string) {
  return lines.map((line, i) => {
    let content: React.ReactNode = line;
    if (markLine && line.includes(markLine)) {
      const [before, after] = line.split(markLine);
      content = (
        <>
          {before}
          <Mark>{markLine}</Mark>
          {after}
        </>
      );
    }
    return (
      <Fragment key={line}>
        {i > 0 && <br />}
        {content}
      </Fragment>
    );
  });
}

const SHOT: Record<HeroVariant, { tab: string; label: string; variant: 'hero' | 'catalogue' }> = {
  default: {
    tab: 'Stocdup · Orders',
    label: 'Add product screenshot: orders + proof of delivery',
    variant: 'hero',
  },
  growth: {
    tab: 'Stocdup · Catalogue',
    label: 'Add product screenshot: catalogue / product discovery',
    variant: 'catalogue',
  },
  operations: {
    tab: 'Stocdup · Order',
    label: 'Add product screenshot: order + invoice status + proof',
    variant: 'hero',
  },
};

export function Hero({ variant = 'default' }: { variant?: HeroVariant }) {
  const hero = HERO[variant];
  const shot = SHOT[variant];

  return (
    <Section band="navy" id="top" innerClassName="py-20 lg:py-[104px]">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:gap-14">
        <div className="flex min-w-0 flex-col gap-6">
          <Eyebrow onDark>{hero.kicker}</Eyebrow>

          <DisplayHeading
            as="h1"
            className="text-white text-[clamp(2.05rem,1rem+4.6vw,4.125rem)] leading-[0.96] tracking-[-0.022em]"
          >
            {renderHeadline(hero.headline, hero.markLine)}
          </DisplayHeading>

          <p className="max-w-[520px] text-[19.5px] leading-[1.6] text-on-navy-muted">
            {hero.lead}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-3.5">
            <Cta section="hero" size="lg" />
            <GhostButton href="#how" onDark>
              See how it works
            </GhostButton>
          </div>

          <p className="mt-2 flex items-start gap-2.5 text-[14px] text-on-navy-dim">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber" aria-hidden />
            <span className="min-w-0">{HERO_CREDIBILITY}</span>
          </p>
        </div>

        <ScreenshotFrame
          tab={shot.tab}
          label={shot.label}
          variant={shot.variant}
          elevated
        />
      </div>
    </Section>
  );
}
