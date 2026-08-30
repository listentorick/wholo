import { cn } from '@/lib/cn';

/** Amber highlight behind a phrase inside a heading. Wraps cleanly across lines. */
export function Mark({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'box-decoration-clone bg-amber px-[0.12em] text-amber-fg',
        className,
      )}
    >
      {children}
    </span>
  );
}
