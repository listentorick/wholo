'use client';

import { cn } from '@/lib/cn';
import { CTA_LABEL } from '@/content';
import { track } from '@/lib/analytics';

interface CtaProps {
  /** Where in the page this CTA sits — analytics attribution. */
  section: string;
  href?: string;
  label?: string;
  fullWidth?: boolean;
  size?: 'md' | 'lg';
  className?: string;
}

/**
 * The single "act here" control. Cobalt, 6px radius, repeated down the page —
 * all instances go to the register form (One Signal Rule: nothing else is
 * this colour).
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
      onClick={() => track('cta_click', { section })}
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
