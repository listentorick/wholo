'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, Lock } from 'lucide-react';
import type { PortalDistributorSummary } from '@wholo/types';

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const CARD_ROW =
  'flex w-full items-center gap-4 rounded-lg border border-border bg-surface p-5 text-left shadow-sm';

function CardInner({
  distributor,
  hover,
  locked,
}: {
  distributor: PortalDistributorSummary;
  hover: boolean;
  locked: boolean;
}) {
  return (
    <>
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-accent-light">
        {distributor.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={distributor.logoUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <span className="text-xs font-semibold text-accent">{initials(distributor.name)}</span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-semibold text-foreground${
            hover ? ' transition-colors group-hover:text-accent' : ''
          }`}
        >
          {distributor.name}
        </span>
        {distributor.email && (
          <span className="mt-0.5 block truncate text-xs text-muted">{distributor.email}</span>
        )}
        {distributor.phone && (
          <span className="block truncate text-xs text-muted">{distributor.phone}</span>
        )}
      </span>

      <span className="flex-shrink-0 text-right">
        <span className="block text-2xl font-semibold leading-none text-foreground tabular-nums">
          {distributor.orderCount}
        </span>
        <span className="mt-0.5 block text-xs text-muted">orders</span>
      </span>

      {locked ? (
        <Lock data-testid="lock-icon" className="h-4 w-4 flex-shrink-0 text-muted" aria-hidden />
      ) : (
        <ChevronRight
          data-testid="chevron-icon"
          className="h-4 w-4 flex-shrink-0 text-muted transition-colors group-hover:text-accent"
          aria-hidden
        />
      )}
    </>
  );
}

export function DistributorCard({
  distributor,
  locked = false,
}: {
  distributor: PortalDistributorSummary;
  locked?: boolean;
}) {
  const router = useRouter();

  if (locked) {
    return (
      <div className={`${CARD_ROW} cursor-not-allowed select-none opacity-40`}>
        <CardInner distributor={distributor} hover={false} locked />
      </div>
    );
  }

  return (
    <button
      onClick={() => router.push(`/${distributor.slug}`)}
      className={`group ${CARD_ROW} transition-all duration-150 will-change-transform hover:-translate-y-1 hover:border-accent hover:shadow-md motion-reduce:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
    >
      <CardInner distributor={distributor} hover locked={false} />
    </button>
  );
}
