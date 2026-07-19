import Link from 'next/link';

interface ListCellLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function ListCellLink({ href, children, className }: ListCellLinkProps) {
  return (
    <Link href={href} className={`block ${className ?? ''}`}>
      {children}
    </Link>
  );
}
