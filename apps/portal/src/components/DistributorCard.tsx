'use client';

import { useRouter } from 'next/navigation';
import type { PortalDistributorSummary } from '@wholo/types';

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function DistributorCard({ distributor }: { distributor: PortalDistributorSummary }) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(`/${distributor.slug}`)}
      className="group w-full text-left bg-white border border-[#E5E7EB] p-5 shadow-sm hover:border-[#D97036] hover:shadow-md transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D97036]"
    >
      <div className="flex items-start gap-4">
        {/* Logo / initials avatar */}
        <div className="flex-shrink-0 h-10 w-10 rounded-full border border-[#E5E7EB] overflow-hidden flex items-center justify-center bg-[#FDF0E8]">
          {distributor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={distributor.logoUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <span className="text-xs font-semibold text-[#D97036]">{initials(distributor.name)}</span>
          )}
        </div>

        {/* Name + contact */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#1A1A1A] truncate group-hover:text-[#D97036] transition-colors">
            {distributor.name}
          </p>
          {distributor.email && (
            <p className="mt-0.5 text-xs text-[#9CA3AF] truncate">{distributor.email}</p>
          )}
          {distributor.phone && (
            <p className="text-xs text-[#9CA3AF] truncate">{distributor.phone}</p>
          )}
        </div>

        {/* Order count stat */}
        <div className="flex-shrink-0 text-right">
          <p className="text-2xl font-semibold text-[#1A1A1A] leading-none">{distributor.orderCount}</p>
          <p className="text-xs text-[#9CA3AF] mt-0.5">orders</p>
        </div>
      </div>
    </button>
  );
}
