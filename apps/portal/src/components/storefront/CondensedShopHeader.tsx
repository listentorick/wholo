'use client';

import type { DistributorInfo } from '@wholo/types';
import type { RelationshipStatus } from '@/lib/distributor-context';
import { RelationshipCta } from './RelationshipCta';

interface Props {
  distributor: DistributorInfo;
  relationshipStatus: RelationshipStatus | null;
  scrolledPast: boolean;
}

/**
 * The compact distributor identity row that appears inside the sticky shop block
 * once the full {@link ShopHeader} has scrolled away — keeps the logo, name and
 * relationship CTA on screen while browsing the catalogue.
 */
export function CondensedShopHeader({ distributor, relationshipStatus, scrolledPast }: Props) {
  return (
    <div
      aria-hidden={!scrolledPast}
      className={`overflow-hidden border-b border-border bg-surface transition-all duration-200 ease-out ${
        scrolledPast ? 'max-h-16 opacity-100' : 'pointer-events-none max-h-0 opacity-0'
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1280px] items-center gap-3 px-4 py-2 md:px-8">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface">
          {distributor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={distributor.logoUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <span className="text-[11px] font-bold text-muted">
              {distributor.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {distributor.name}
        </span>
        <RelationshipCta
          distributorName={distributor.name}
          relationshipStatus={relationshipStatus}
          variant="condensed"
        />
      </div>
    </div>
  );
}
