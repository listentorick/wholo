import { cn } from '@/lib/cn';

/** Flat container: white, 8px radius, hairline border. Lifts a touch on hover. */
export function Card({
  children,
  className,
  as: Tag = 'div',
  interactive = true,
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'li';
  interactive?: boolean;
}) {
  return (
    <Tag
      className={cn(
        'rounded-lg border border-border bg-white p-7',
        interactive &&
          'transition duration-200 ease-out will-change-transform hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_18px_40px_-22px_rgba(11,29,58,0.28)] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
