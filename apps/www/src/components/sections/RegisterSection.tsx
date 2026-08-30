import { REGISTER } from '@/content';
import { Section } from '../layout/Section';
import { Eyebrow } from '../ui/Eyebrow';
import { DisplayHeading } from '../ui/DisplayHeading';
import { Icon } from '../ui/Icon';
import { RegisterFormLazy } from '../register/RegisterFormLazy';
import { Reveal } from '../motion/Reveal';

export function RegisterSection({ variant = 'default' }: { variant?: string }) {
  return (
    <Section band="navy" id="register">
      <div className="grid items-start gap-14 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        <Reveal className="flex flex-col gap-4">
          <Eyebrow onDark>{REGISTER.eyebrow}</Eyebrow>
          <DisplayHeading className="text-white text-[clamp(1.9rem,1.3rem+2.5vw,2.75rem)]">
            {REGISTER.heading}
          </DisplayHeading>
          <p className="max-w-[440px] text-[17px] text-on-navy-muted">{REGISTER.lead}</p>
          <ul className="mt-1.5 flex flex-col gap-2.5">
            {REGISTER.whatHappens.map((item) => (
              <li key={item} className="flex gap-3">
                <Icon name="check" strokeWidth={2.2} className="mt-0.5 h-5 w-5 shrink-0 text-sky" />
                <span className="min-w-0 text-[14px] text-on-navy-soft">{item}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <RegisterFormLazy variant={variant} />
      </div>
    </Section>
  );
}
