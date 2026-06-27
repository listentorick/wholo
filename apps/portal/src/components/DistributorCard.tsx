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

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CardInner({ distributor, hover }: { distributor: PortalDistributorSummary; hover: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex-shrink-0 h-10 w-10 rounded-full border border-[#E5E7EB] overflow-hidden flex items-center justify-center bg-[#FDF0E8]">
        {distributor.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={distributor.logoUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <span className="text-xs font-semibold text-[#D97036]">{initials(distributor.name)}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold text-[#1A1A1A] truncate${hover ? ' group-hover:text-[#D97036] transition-colors' : ''}`}>
          {distributor.name}
        </p>
        {distributor.email && (
          <p className="mt-0.5 text-xs text-[#9CA3AF] truncate">{distributor.email}</p>
        )}
        {distributor.phone && (
          <p className="text-xs text-[#9CA3AF] truncate">{distributor.phone}</p>
        )}
      </div>

      <div className="flex-shrink-0 text-right">
        <p className="text-2xl font-semibold text-[#1A1A1A] leading-none">{distributor.orderCount}</p>
        <p className="text-xs text-[#9CA3AF] mt-0.5">orders</p>
      </div>
    </div>
  );
}

export function DistributorCard({ distributor, locked = false }: { distributor: PortalDistributorSummary; locked?: boolean }) {
  const router = useRouter();

  if (locked) {
    return (
      <div className="relative w-full text-left bg-white border border-[#E5E7EB] p-5 shadow-sm opacity-40 cursor-not-allowed select-none">
        <span className="absolute top-2 right-2 text-[#9CA3AF]">
          <LockIcon />
        </span>
        <CardInner distributor={distributor} hover={false} />
      </div>
    );
  }

  return (
    <button
      onClick={() => router.push(`/${distributor.slug}`)}
      className="group w-full text-left bg-white border border-[#E5E7EB] p-5 shadow-sm hover:border-[#D97036] hover:shadow-md transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D97036]"
    >
      <CardInner distributor={distributor} hover={true} />
    </button>
  );
}
