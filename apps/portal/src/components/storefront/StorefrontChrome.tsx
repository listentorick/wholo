'use client';

import { useDistributor } from '@/lib/distributor-context';
import { CoverBanner } from './CoverBanner';
import { ShopHeader } from './ShopHeader';
import { StickyShopBlock, type StickyBlockTabs } from './StickyShopBlock';

/**
 * The distributor storefront chrome — cover banner, shop header, and the sticky
 * block (condensed header + tabs + amber order-by bar). Shared by the storefront
 * page (tabs scroll-spy) and its sub-pages like product detail (tabs link back
 * to `/{slug}#…`) so every distributor page reads as the same storefront.
 *
 * Reads the distributor / relationship / scroll context itself; the caller only
 * decides how the tabs behave.
 */
export function StorefrontChrome({ slug, tabs }: { slug: string; tabs: StickyBlockTabs }) {
  const { distributor, relationshipStatus, shopHeaderScrolledPast, setShopHeaderScrolledPast } =
    useDistributor();

  if (!distributor) return null;

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
