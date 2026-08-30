import { cn } from '@/lib/cn';
import { CTA_LABEL } from '@/content';

interface CtaProps {
  /** Where in the page this CTA sits — used for analytics attribution (Phase E). */
  section: string;
  href?: string;
  label?: string;
  fullWidth?: boolean;
  size?: 'md' | 'lg';
  className?: string;
}

/**
 * The single "act here" control. Cobalt, 6px radius. Repeated down the page —
 * all instances point at the register form. One Cobalt action per viewport
 * (the One Signal Rule): nothing else on the page is this colour.
 */
export function Cta({
  section,
  href = '#register',
  label = CTA_LABEL,
  fullWidth,
  size = 'md',
  className,
}: CtaProps) {
  return (
    <a
      href={href}
      data-cta-section={section}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-md bg-primary font-bold tracking-[-0.01em] text-white transition-colors hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        size === 'lg' ? 'px-6 py-3.5 text-[15px]' : 'px-5 py-2.5 text-[15px]',
        fullWidth && 'w-full',
        className,
      )}
    >
      {label}
    </a>
  );
}
