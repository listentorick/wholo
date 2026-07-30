'use client';

import { useDistributor } from '@/lib/distributor-context';
import { UserMenuButton } from './UserMenuButton';

export function DistributorHeader({ distributorSlug }: { distributorSlug: string }) {
  const { distributor } = useDistributor();

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
        <UserMenuButton />
      </div>
    </header>
  );
}
