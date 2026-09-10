'use client';

import { useEffect, useRef } from 'react';
import type { DistributorInfo } from '@wholo/types';
import type { RelationshipStatus } from '@/lib/distributor-context';
import type { DeliveryParts } from '@/lib/hooks/use-delivery-parts';
import { SearchInput } from '@/components/SearchInput';
import { CondensedShopHeader } from './CondensedShopHeader';
import { StorefrontTabs, type StorefrontSection } from './StorefrontTabs';
import { AmberOrderByBar } from './AmberOrderByBar';

interface Props {
  slug: string;
  distributor: DistributorInfo;
  relationshipStatus: RelationshipStatus | null;
  scrolledPast: boolean;
  sections: StorefrontSection[];
  activeSection: string;
  onSelectSection: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  productCount: number | null;
  deliveryParts: DeliveryParts | null;
  subtotal: number;
  effectiveMinSpend: number | null;
}

/**
 * The block that sticks to the top of the viewport (below any `OrderAsBanner`)
 * once the shop header scrolls away: condensed identity row → tabs + in-shop
 * search → the amber order-by bar. Publishes its own height as `--sticky-stack-h`
 * so the sections can set `scroll-margin-top` and land in the right place.
 */
export function StickyShopBlock({
  slug,
  distributor,
  relationshipStatus,
  scrolledPast,
  sections,
  activeSection,
  onSelectSection,
  search,
  onSearchChange,
  productCount,
  deliveryParts,
  subtotal,
  effectiveMinSpend,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty('--sticky-stack-h', `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--sticky-stack-h');
    };
  }, []);

  return (
    <div
      ref={ref}
      className="sticky top-[var(--orderas-h,0px)] z-30 bg-page"
    >
      <CondensedShopHeader
        distributor={distributor}
        relationshipStatus={relationshipStatus}
        scrolledPast={scrolledPast}
      />

      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-1 px-4 md:flex-row md:items-center md:justify-between md:gap-4 md:px-2">
          <StorefrontTabs
            slug={slug}
            sections={sections}
            activeSection={activeSection}
            onSelectSection={onSelectSection}
          />
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder={productCount != null ? `Search all ${productCount} products` : 'Search products…'}
            className="mb-2 w-full md:mb-0 md:max-w-xs"
          />
        </div>
      </div>

      <AmberOrderByBar
        deliveryParts={deliveryParts}
        subtotal={subtotal}
        effectiveMinSpend={effectiveMinSpend}
      />
    </div>
  );
}
