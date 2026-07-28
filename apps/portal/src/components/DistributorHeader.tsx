'use client';

import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart-context';
import { useDistributor } from '@/lib/distributor-context';
import { UserMenuButton } from './UserMenuButton';

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 mt-0.5">
      <path d="M6 9C6 4.5 18 4.5 18 9" />
      <path d="M2 9h20l-2 10a2 2 0 01-2 2H6a2 2 0 01-2-2L2 9z" />
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
    <header className="hidden md:grid md:grid-cols-[1fr_auto_1fr] sticky top-0 z-20 items-center bg-white border-b border-[#E5E7EB] h-14 px-4">
      {/* Left spacer — balances the right actions so the identity block below is truly centered */}
      <div />

      {/* Distributor identity */}
      <div className="flex items-center gap-2 justify-self-center text-sm font-medium tracking-wide text-[#1A1A1A]">
        {logoUrl && (
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E5E7EB]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          </span>
        )}
        {distributorName}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 justify-self-end">
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
        <UserMenuButton />
      </div>
    </header>
  );
}
