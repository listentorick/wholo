import { cn } from '@/lib/cn';

/** Flat container: white, 8px radius, hairline border. Shadow is reserved for genuine elevation. */
export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'li';
}) {
  return (
    <Tag className={cn('rounded-lg border border-border bg-white p-7', className)}>
      {children}
    </Tag>
  );
}
