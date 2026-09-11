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
export function StorefrontChrome({ slug, mode }: { slug: string; mode: 'spy' | 'link' }) {
  const { distributor, relationshipStatus, shopHeaderScrolledPast, setShopHeaderScrolledPast } =
    useDistributor();
  const [activeSection, scrollToSection] = useScrollSpy(SECTION_IDS, mode === 'spy');

  if (!distributor) return null;

  // In link mode (product detail) there's no scroll to spy on, but a product
  // page still belongs to the catalogue — highlight that tab statically.
  const tabs: StorefrontTabsConfig =
    mode === 'spy'
      ? { mode: 'spy', activeSection, onSelectSection: scrollToSection }
      : { mode: 'link', activeSection: 'catalogue' };

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
