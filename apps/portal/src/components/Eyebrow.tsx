import clsx from 'clsx';

interface EyebrowProps {
  children: React.ReactNode;
  /** Wrapper extras, e.g. 'mb-2'. */
  className?: string;
}

/**
 * Section kicker — an amber dash followed by an uppercase, wide-tracked label.
 * Borrowed from the marketing site. Amber here means "notice this", never a link;
 * it never doubles as an action colour (that stays Cobalt).
 */
export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.14em] text-muted',
        className,
      )}
    >
      <span className="h-1 w-[22px] rounded-full bg-amber" aria-hidden />
      {children}
    </span>
  );
}
