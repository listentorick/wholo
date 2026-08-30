import { cn } from '@/lib/cn';
import { Icon } from './Icon';

/** Quiet secondary control ("See how it works"). Never competes with the Cta. */
export function GhostButton({
  href,
  children,
  onDark,
  className,
}: {
  href: string;
  children: React.ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md border px-6 py-3.5 text-[15px] font-bold tracking-[-0.01em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        onDark
          ? 'border-white/25 text-white hover:bg-white/10 focus-visible:outline-white'
          : 'border-border text-navy hover:bg-canvas focus-visible:outline-primary',
        className,
      )}
    >
      {children}
      <Icon name="arrow-right" className="h-[18px] w-[18px]" strokeWidth={1.9} />
    </a>
  );
}
