import { cn } from '@/lib/cn';
import { Icon } from './Icon';

/** A ticked list row: cobalt check + text. */
export function Bullet({
  children,
  onDark,
  className,
}: {
  children: React.ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <li className={cn('flex gap-3', className)}>
      <Icon
        name="check"
        strokeWidth={2.2}
        className={cn('mt-0.5 h-5 w-5', onDark ? 'text-sky' : 'text-primary')}
      />
      <span className={cn('min-w-0 text-[16px]', onDark ? 'text-on-navy-soft' : 'text-muted')}>
        {children}
      </span>
    </li>
  );
}
