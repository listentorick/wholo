import { cn } from '@/lib/cn';

interface DisplayHeadingProps {
  children: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  id?: string;
}

/**
 * Section heading — the Choco-style display treatment: uppercase Inter 800,
 * tight tracking + leading. Size is set per-use via className.
 */
export function DisplayHeading({
  children,
  as: Tag = 'h2',
  className,
  id,
}: DisplayHeadingProps) {
  return (
    <Tag
      id={id}
      className={cn(
        'text-balance break-words font-extrabold uppercase leading-[1.01] tracking-display text-[clamp(1.95rem,1.2rem+3vw,3.1875rem)]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
