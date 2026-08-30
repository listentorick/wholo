import Image from 'next/image';
import { cn } from '@/lib/cn';

interface WordmarkProps {
  /** 'dark' = for light backgrounds, 'light' = for navy backgrounds */
  tone?: 'dark' | 'light';
  markSize?: number;
  textClassName?: string;
  className?: string;
}

/** The Stocdup lockup: hexagon mark + "stocd·up" wordmark ("up" in the signal colour). */
export function Wordmark({
  tone = 'dark',
  markSize = 56,
  textClassName = 'text-[32px]',
  className,
}: WordmarkProps) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <Image
        src={tone === 'light' ? '/logo-mark-white.png' : '/logo-mark.png'}
        alt=""
        width={markSize}
        height={markSize}
        priority
        style={{ width: markSize, height: 'auto' }}
      />
      <span
        className={cn(
          'font-extrabold tracking-[-0.045em]',
          tone === 'light' ? 'text-white' : 'text-navy',
          textClassName,
        )}
      >
        stocd<span className={tone === 'light' ? 'text-sky' : 'text-primary'}>up</span>
      </span>
    </span>
  );
}
