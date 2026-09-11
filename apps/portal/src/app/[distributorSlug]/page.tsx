'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { catalogueApi } from '@wholo/api-client';
import { TradeRelationshipStatus, type CatalogueProduct } from '@wholo/types';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useDistributor } from '@/lib/distributor-context';
import { useCart } from '@/lib/cart-context';
import { useStorefrontSearch } from '@/lib/storefront-search';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { StorefrontChrome } from '@/components/storefront/StorefrontChrome';
import { CatalogueSection } from '@/components/storefront/CatalogueSection';
import { AboutSection } from '@/components/storefront/AboutSection';
import { DeliveryTermsSection } from '@/components/storefront/DeliveryTermsSection';

const PAGE_SIZE = 24;

/**
 * The distributor storefront — one scrolling page: Catalogue / About /
 * Delivery & terms. The storefront chrome (cover banner, shop header, sticky
 * tabs + amber bar) is rendered by the distributor layout, not here.
 */
export default function StorefrontPage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();

  const { user, accessToken, isLoading: authLoading } = useRequireAuth(pathname ?? `/${distributorSlug}`);
  const { distributor, relationshipStatus } = useDistributor();
  const { quantities, savingItems, syncItem } = useCart();
  const { debouncedSearch, setProductCount } = useStorefrontSearch();

  const isActive = relationshipStatus === TradeRelationshipStatus.ACTIVE;

  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);

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
        setProductCount(res.pagination.total);
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
  }, [distributorSlug, user, accessToken, debouncedSearch, setProductCount]);

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
      <StorefrontChrome slug={distributorSlug} mode="spy" />

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
      />

      <AboutSection distributor={distributor} relationshipStatus={relationshipStatus} />

      <DeliveryTermsSection />
    </>
  );
}
