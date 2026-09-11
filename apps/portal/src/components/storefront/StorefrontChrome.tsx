'use client';

import { useDistributor } from '@/lib/distributor-context';
import { useScrollSpy } from '@/lib/hooks/use-scroll-spy';
import { CoverBanner } from './CoverBanner';
import { ShopHeader } from './ShopHeader';
import { StickyShopBlock } from './StickyShopBlock';
import { STOREFRONT_SECTIONS, type StorefrontTabsConfig } from './StorefrontTabs';

const SECTION_IDS = STOREFRONT_SECTIONS.map((s) => s.id);

/**
 * The distributor storefront chrome — cover banner, shop header, and the sticky
 * block (condensed header + tabs + amber order-by bar). Rendered once in the
 * distributor layout (`DistributorMain`) so it persists across storefront ⇄
 * product navigation without remounting.
 *
 * - `mode="spy"`  — on the storefront route: tabs scroll-spy the in-page sections.
 * - `mode="link"` — on sub-pages (product detail): tabs link back to `/{slug}#…`.
 */
export function StorefrontChrome({
  slug,
  mode,
  activeTab = 'catalogue',
}: {
  slug: string;
  mode: 'spy' | 'link';
  /** Which tab to statically highlight in link mode: product detail belongs to
   *  the catalogue, orders pages highlight the Orders tab instead. */
  activeTab?: 'catalogue' | 'orders';
}) {
  const { distributor, relationshipStatus, shopHeaderScrolledPast, setShopHeaderScrolledPast } =
    useDistributor();
  const [activeSection, scrollToSection] = useScrollSpy(SECTION_IDS, mode === 'spy');

  if (!distributor) return null;

  // In link mode there's no scroll to spy on, so the caller tells us statically
  // which tab the current sub-page belongs to (defaults to catalogue).
  const tabs: StorefrontTabsConfig =
    mode === 'spy'
      ? { mode: 'spy', activeSection, onSelectSection: scrollToSection }
      : { mode: 'link', activeSection: activeTab };

  return (
    <>
      <CoverBanner bannerUrl={distributor.bannerUrl} />
      <ShopHeader
        distributor={distributor}
        relationshipStatus={relationshipStatus}
        onScrolledPast={setShopHeaderScrolledPast}
      />
      <StickyShopBlock
        slug={slug}
        distributor={distributor}
        relationshipStatus={relationshipStatus}
        scrolledPast={shopHeaderScrolledPast}
        tabs={tabs}
      />
    </>
  );
}
