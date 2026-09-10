'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { DistributorInfo } from '@wholo/types';
import type { RelationshipStatus } from '@/lib/distributor-context';
import { SearchInput } from '@/components/SearchInput';
import { CondensedShopHeader } from './CondensedShopHeader';
import { StorefrontTabs, STOREFRONT_SECTIONS, type StorefrontTabsConfig } from './StorefrontTabs';
import { AmberOrderByBar } from './AmberOrderByBar';

export type StickyBlockTabs =
  | (Extract<StorefrontTabsConfig, { mode: 'spy' }> & {
      search: string;
      onSearchChange: (value: string) => void;
      productCount: number | null;
    })
  | Extract<StorefrontTabsConfig, { mode: 'link' }>;

interface Props {
  slug: string;
  distributor: DistributorInfo;
  relationshipStatus: RelationshipStatus | null;
  scrolledPast: boolean;
  tabs: StickyBlockTabs;
}

/**
 * The block that sticks to the top of the viewport (below any `OrderAsBanner`)
 * once the shop header scrolls away: condensed identity row → tabs + in-shop
 * search → the amber order-by bar. Publishes its own height as `--sticky-stack-h`
 * so the sections can set `scroll-margin-top` and land in the right place.
 *
 * Shared by the storefront (tabs scroll-spy) and its sub-pages like product
 * detail (tabs link back to `/{slug}#…`).
 */
export function StickyShopBlock({ slug, distributor, relationshipStatus, scrolledPast, tabs }: Props) {
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

  const tabsConfig: StorefrontTabsConfig =
    tabs.mode === 'spy'
      ? { mode: 'spy', activeSection: tabs.activeSection, onSelectSection: tabs.onSelectSection }
      : { mode: 'link' };

  return (
    <div ref={ref} className="sticky top-[var(--orderas-h,0px)] z-30 bg-page">
      <CondensedShopHeader
        distributor={distributor}
        relationshipStatus={relationshipStatus}
        scrolledPast={scrolledPast}
      />

      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-4 md:px-2">
          <StorefrontTabs slug={slug} sections={STOREFRONT_SECTIONS} tabs={tabsConfig} />

          {/* Desktop keeps the search in the sticky row (per the mock); mobile
              gets it at the top of the catalogue section instead. On sub-pages
              the field is a link back to the catalogue. */}
          {tabs.mode === 'spy' ? (
            <SearchInput
              value={tabs.search}
              onChange={tabs.onSearchChange}
              placeholder={
                tabs.productCount != null ? `Search all ${tabs.productCount} products` : 'Search products…'
              }
              className="hidden w-full max-w-xs flex-shrink-0 md:block"
            />
          ) : (
            <Link
              href={`/${slug}#catalogue`}
              className="hidden w-full max-w-xs flex-shrink-0 items-center gap-2.5 rounded-md border border-border bg-white px-3.5 py-2.5 text-sm text-muted transition-colors hover:border-muted md:flex"
            >
              <Search className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} />
              Search products
            </Link>
          )}
        </div>
      </div>

      <AmberOrderByBar />
    </div>
  );
}
