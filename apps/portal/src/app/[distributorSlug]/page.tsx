'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { catalogueApi } from '@wholo/api-client';
import { TradeRelationshipStatus, type CatalogueProduct } from '@wholo/types';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { useDistributor } from '@/lib/distributor-context';
import { useCart } from '@/lib/cart-context';
import { useDeliveryParts } from '@/lib/hooks/use-delivery-parts';
import { useViewerOrderCount } from '@/lib/hooks/use-viewer-order-count';
import { useScrollSpy } from '@/lib/hooks/use-scroll-spy';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { CoverBanner } from '@/components/storefront/CoverBanner';
import { ShopHeader } from '@/components/storefront/ShopHeader';
import { StickyShopBlock } from '@/components/storefront/StickyShopBlock';
import { CatalogueSection } from '@/components/storefront/CatalogueSection';
import { AboutSection } from '@/components/storefront/AboutSection';
import { DeliveryTermsSection } from '@/components/storefront/DeliveryTermsSection';
import type { StorefrontSection } from '@/components/storefront/StorefrontTabs';

const SECTIONS: StorefrontSection[] = [
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'about', label: 'About' },
  { id: 'delivery', label: 'Delivery & terms' },
];
const SECTION_IDS = SECTIONS.map((s) => s.id);
const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The distributor storefront — one scrolling page. Cover banner + shop header +
 * the sticky shop block (condensed header, tabs, amber order-by bar), then the
 * Catalogue / About / Delivery & terms sections the tabs scroll between.
 * Replaces the old three-route About / Shop / Orders split (Orders stays its own
 * route, linked from the tab bar).
 */
export default function StorefrontPage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();

  const { user, accessToken, isLoading: authLoading } = useRequireAuth(pathname ?? `/${distributorSlug}`);
  const { orderAsMode } = useAuth();
  const {
    distributor,
    relationshipStatus,
    effectiveMinSpend,
    shopHeaderScrolledPast,
    setShopHeaderScrolledPast,
  } = useDistributor();
  const { quantities, savingItems, syncItem, subtotal } = useCart();

  const isActive = relationshipStatus === TradeRelationshipStatus.ACTIVE;
  const deliveryParts = useDeliveryParts(distributorSlug, accessToken, {
    enabled: isActive,
    refreshKey: orderAsMode,
  });
  const orderCount = useViewerOrderCount(distributorSlug);
  const [activeSection, scrollToSection] = useScrollSpy(SECTION_IDS, !!distributor);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!user || !accessToken) return;
    let cancelled = false;
    setCatalogueLoading(true);
    setCatalogueError(null);
    catalogueApi
      .getProducts(distributorSlug, {
        limit: PAGE_SIZE,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      })
      .then((res) => {
        if (cancelled) return;
        setProducts(res.data);
        setTotal(res.pagination.total);
        setNextCursor(res.pagination.hasMore ? res.pagination.nextCursor : null);
      })
      .catch(() => {
        if (!cancelled) setCatalogueError('Failed to load products. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setCatalogueLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [distributorSlug, user, accessToken, debouncedSearch]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await catalogueApi.getProducts(distributorSlug, {
        limit: PAGE_SIZE,
        cursor: nextCursor,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      setProducts((prev) => [...prev, ...res.data]);
      setNextCursor(res.pagination.hasMore ? res.pagination.nextCursor : null);
    } catch {
      // keep the products already loaded
    } finally {
      setLoadingMore(false);
    }
  }, [distributorSlug, nextCursor, loadingMore, debouncedSearch]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (value && activeSection !== 'catalogue') scrollToSection('catalogue');
    },
    [activeSection, scrollToSection],
  );

  if (authLoading || !distributor) {
    return (
      <PageShell center>
        <PageSpinner />
      </PageShell>
    );
  }
  if (!user) return null;

  return (
    <>
      <CoverBanner bannerUrl={distributor.bannerUrl} dominantColor={distributor.bannerDominantColor} />

      <ShopHeader
        distributor={distributor}
        relationshipStatus={relationshipStatus}
        orderCount={orderCount}
        onScrolledPast={setShopHeaderScrolledPast}
      />

      <StickyShopBlock
        slug={distributorSlug}
        distributor={distributor}
        relationshipStatus={relationshipStatus}
        scrolledPast={shopHeaderScrolledPast}
        sections={SECTIONS}
        activeSection={activeSection}
        onSelectSection={scrollToSection}
        search={search}
        onSearchChange={handleSearchChange}
        productCount={total}
        deliveryParts={deliveryParts}
        subtotal={subtotal}
        effectiveMinSpend={effectiveMinSpend}
      />

      <CatalogueSection
        slug={distributorSlug}
        currencyCode={distributor.currencyCode ?? 'GBP'}
        canOrder={isActive}
        products={products}
        quantities={quantities}
        savingItems={savingItems}
        onQtyChange={syncItem}
        loading={catalogueLoading}
        loadingMore={loadingMore}
        hasMore={nextCursor !== null}
        onLoadMore={loadMore}
        error={catalogueError}
        search={search}
        onSearchChange={handleSearchChange}
        productCount={total}
        searchActive={debouncedSearch.length > 0}
        searchTerm={debouncedSearch}
      />

      <AboutSection distributor={distributor} relationshipStatus={relationshipStatus} />

      <DeliveryTermsSection
        distributor={distributor}
        effectiveMinSpend={effectiveMinSpend}
        deliveryParts={deliveryParts}
      />
    </>
  );
}
