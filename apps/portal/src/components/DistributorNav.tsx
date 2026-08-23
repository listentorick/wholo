'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShoppingBasket } from 'lucide-react';
import { useCart } from '@/lib/cart-context';
import { useDistributor } from '@/lib/distributor-context';
import { MinimumOrderProgress } from './MinimumOrderProgress';

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
  const router = useRouter();
  const { cartCount, subtotal } = useCart();
  const { minOrderBarScrolledPast, effectiveMinSpend } = useDistributor();

  const showCollapsedMinOrderBar =
    minOrderBarScrolledPast && effectiveMinSpend !== null && subtotal < effectiveMinSpend;

  return (
    <nav className="sticky top-14 z-10 bg-white border-b border-[#E5E7EB]">
      <div className="flex items-center justify-between pr-4">
        <div className="flex min-w-0 whitespace-nowrap overflow-x-auto">
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
                    ? 'text-[#1A1A1A] border-accent'
                    : 'text-[#9CA3AF] border-transparent hover:text-[#1A1A1A]',
                ].join(' ')}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <button
          onClick={() => router.push(`/${distributorSlug}/checkout`)}
          className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center text-[#1A1A1A]"
          aria-label={`Cart, ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
        >
          {cartCount > 0 && (
            <span className="absolute -top-0.5 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold leading-none text-white">
              {cartCount}
            </span>
          )}
          <ShoppingBasket className="h-5 w-5 mt-0.5" strokeWidth={1.5} />
        </button>
      </div>

      <div
        aria-hidden={!showCollapsedMinOrderBar}
        className={[
          'overflow-hidden border-t border-[#E5E7EB] px-5 transition-[max-height,opacity] duration-300 ease-out',
          showCollapsedMinOrderBar ? 'max-h-20 opacity-100 py-2.5' : 'max-h-0 opacity-0 py-0',
        ].join(' ')}
      >
        <MinimumOrderProgress subtotal={subtotal} minimum={effectiveMinSpend} size="compact" />
      </div>
    </nav>
  );
}
