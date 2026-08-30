import { cn } from '@/lib/cn';
import { Eyebrow } from './Eyebrow';
import { DisplayHeading } from './DisplayHeading';

interface SectionHeaderProps {
  eyebrow: string;
  heading: React.ReactNode;
  lead?: string;
  onDark?: boolean;
  headingId?: string;
  className?: string;
  maxWidthLead?: boolean;
}

export function SectionHeader({
  eyebrow,
  heading,
  lead,
  onDark,
  headingId,
  className,
  maxWidthLead = true,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex max-w-[760px] flex-col gap-4', className)}>
      <Eyebrow onDark={onDark}>{eyebrow}</Eyebrow>
      <DisplayHeading id={headingId} className={onDark ? 'text-white' : 'text-navy'}>
        {heading}
      </DisplayHeading>
      {lead && (
        <p
          className={cn(
            'text-[18.5px] leading-[1.62]',
            maxWidthLead && 'max-w-[640px]',
            onDark ? 'text-on-navy-muted' : 'text-muted',
          )}
        >
          {lead}
        </p>
      )}
    </div>
  );
}
