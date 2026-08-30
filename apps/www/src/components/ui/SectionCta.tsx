import { cn } from '@/lib/cn';
import { Cta } from './Cta';
import { Reveal } from '../motion/Reveal';

/** The repeated end-of-section call to action. */
export function SectionCta({ section, className }: { section: string; className?: string }) {
  return (
    <Reveal className={cn('mt-12', className)} y={16}>
      <Cta section={section} />
    </Reveal>
  );
}
