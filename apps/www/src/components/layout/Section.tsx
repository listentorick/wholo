import { cn } from '@/lib/cn';

type Band = 'white' | 'stone' | 'navy';

const BAND: Record<Band, string> = {
  white: 'bg-white text-foreground',
  stone: 'bg-canvas text-foreground',
  navy: 'bg-navy text-white',
};

interface SectionProps {
  id?: string;
  band?: Band;
  children: React.ReactNode;
  className?: string;
  /** Inner wrapper class overrides (e.g. remove default max-width). */
  innerClassName?: string;
  /** Tighter vertical rhythm for utility bands like the proof strip. */
  compact?: boolean;
}

/** A full-bleed colour band with a centred content column. */
export function Section({
  id,
  band = 'white',
  children,
  className,
  innerClassName,
  compact,
}: SectionProps) {
  return (
    <section id={id} className={cn(BAND[band], className)}>
      <div
        className={cn(
          'mx-auto max-w-wrap px-6 sm:px-8 lg:px-12',
          compact ? 'py-7' : 'py-16 md:py-24 lg:py-[104px]',
          innerClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
