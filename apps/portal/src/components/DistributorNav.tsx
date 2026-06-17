'use client';

import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart-context';
import { useDistributor } from '@/lib/distributor-context';

export function DistributorNav({ distributorSlug }: { distributorSlug: string }) {
  const { cartCount } = useCart();
  const router = useRouter();
  const { distributor, bannerScrolledPast } = useDistributor();

  const distributorName = distributor?.name ?? distributorSlug;
  const logoUrl = distributor?.logoUrl ?? null;
  const showLogo = bannerScrolledPast && Boolean(logoUrl);

  return (
    <>
      <style>{`
        @keyframes dist-nav-fade-down {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .dist-nav { animation: dist-nav-fade-down 0.35s ease both; }

        .dist-nav-cart-badge {
          position: absolute;
          top: -2px;
          right: -4px;
          font-size: 11px;
          font-weight: 600;
          color: #1A1A1A;
          line-height: 1;
        }

        .nav-logo-circle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          overflow: hidden;
          border: 1.5px solid #E5E7EB;
          flex-shrink: 0;
          transition: opacity 0.2s, transform 0.2s;
        }
        .nav-logo-enter { opacity: 1; transform: scale(1); }
        .nav-logo-exit  { opacity: 0; transform: scale(0.7); pointer-events: none; position: absolute; }
      `}</style>

      <nav className="dist-nav sticky top-0 z-20 w-full bg-white border-b border-[#E5E7EB] flex items-center justify-between px-4 py-3.5">

        {/* Left: hamburger + search */}
        <div className="flex items-center gap-1">
          <button className="flex h-9 w-9 items-center justify-center text-[#1A1A1A]" aria-label="Menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
              <line x1="3" y1="6"  x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <button className="flex h-9 w-9 items-center justify-center text-[#9CA3AF]" aria-label="Search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>

        {/* Centre: logo (when scrolled) + distributor name */}
        <button className="flex items-center gap-2 text-sm font-medium tracking-wide text-[#1A1A1A]">
          {logoUrl && (
            <span className={`nav-logo-circle ${showLogo ? 'nav-logo-enter' : 'nav-logo-exit'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" className="h-full w-full object-cover" draggable={false} />
            </span>
          )}
          {distributorName}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-[#9CA3AF]">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Right: cart icon + badge */}
        <button
          onClick={() => router.push(`/${distributorSlug}/checkout`)}
          className="relative flex h-9 w-9 items-center justify-center text-[#1A1A1A]"
          aria-label={`Cart, ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
        >
          {cartCount > 0 && (
            <span className="dist-nav-cart-badge absolute">{cartCount}</span>
          )}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 mt-1">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 01-8 0" />
          </svg>
        </button>

      </nav>
    </>
  );
}
