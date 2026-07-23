import Link from 'next/link';

interface DetailBreadcrumbProps {
  href: string;
  label: string;
}

export function DetailBreadcrumb({ href, label }: DetailBreadcrumbProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {label}
    </Link>
  );
}
