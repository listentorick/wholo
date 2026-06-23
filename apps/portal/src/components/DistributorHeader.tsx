'use client';

import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart-context';
import { useDistributor } from '@/lib/distributor-context';

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 mt-0.5">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  );
}

export function DistributorHeader({ distributorSlug }: { distributorSlug: string }) {
  const { distributor } = useDistributor();
  const { cartCount } = useCart();
  const router = useRouter();

  const distributorName = distributor?.name ?? distributorSlug;
  const logoUrl = distributor?.logoUrl ?? null;

  return (
    <header className="hidden md:flex sticky top-0 z-20 items-center justify-between bg-white border-b border-[#E5E7EB] h-14 px-4">
      {/* Distributor identity */}
      <button className="flex items-center gap-2 text-sm font-medium tracking-wide text-[#1A1A1A]">
        {logoUrl && (
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E5E7EB]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          </span>
        )}
        {distributorName}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-[#9CA3AF]">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Cart */}
      <button
        onClick={() => router.push(`/${distributorSlug}/checkout`)}
        className="relative flex h-9 w-9 items-center justify-center text-[#1A1A1A]"
        aria-label={`Cart, ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
      >
        {cartCount > 0 && (
          <span className="absolute -top-0.5 -right-1 text-[11px] font-semibold leading-none text-[#1A1A1A]">
            {cartCount}
          </span>
        )}
        <CartIcon />
      </button>
    </header>
  );
}
