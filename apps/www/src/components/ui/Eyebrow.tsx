import { cn } from '@/lib/cn';

interface EyebrowProps {
  children: React.ReactNode;
  onDark?: boolean;
  className?: string;
}

/** Kicker label: an amber tick + uppercase tracked text. Amber = "notice", never a link. */
export function Eyebrow({ children, onDark, className }: EyebrowProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 text-[12.5px] font-bold uppercase tracking-[0.14em]',
        onDark ? 'text-on-navy-muted' : 'text-muted',
        className,
      )}
    >
      <span className="h-1 w-[22px] rounded-full bg-amber" aria-hidden />
      {children}
    </span>
  );
}
