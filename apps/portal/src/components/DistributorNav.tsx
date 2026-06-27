'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  distributorSlug: string;
}

const TABS = [
  { label: 'About',  href: (slug: string) => `/${slug}`,          exact: true  },
  { label: 'Shop',   href: (slug: string) => `/${slug}/products`, exact: false },
  { label: 'Orders', href: (slug: string) => `/${slug}/orders`,   exact: false },
];

export function DistributorNav({ distributorSlug }: Props) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-14 z-10 bg-white border-b border-[#E5E7EB] overflow-x-auto">
      <div className="flex whitespace-nowrap">
        {TABS.map((tab) => {
          const href = tab.href(distributorSlug);
          const isActive = tab.exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={tab.label}
              href={href}
              className={[
                'inline-flex items-center px-5 py-3 text-sm font-medium border-b-[3px] transition-colors',
                isActive
                  ? 'text-[#1A1A1A] border-[#D97036]'
                  : 'text-[#9CA3AF] border-transparent hover:text-[#1A1A1A]',
              ].join(' ')}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
