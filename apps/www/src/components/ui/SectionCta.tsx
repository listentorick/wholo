import { cn } from '@/lib/cn';
import { Cta } from './Cta';

/** The repeated end-of-section call to action. */
export function SectionCta({ section, className }: { section: string; className?: string }) {
  return (
    <div className={cn('mt-12', className)}>
      <Cta section={section} />
    </div>
  );
}
