'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useCart } from '@/lib/cart-context';
import { useDistributor } from '@/lib/distributor-context';
import { catalogueApi } from '@wholo/api-client';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { SearchInput } from '@/components/SearchInput';
import { QuantityStepper } from '@/components/QuantityStepper';
import { TradeRelationshipStatus, formatMoney, type CatalogueProduct, type CatalogueProductsResponse } from '@wholo/types';

const SEARCH_DEBOUNCE_MS = 300;

function formatPrice(price: string | null, currencyCode: string): string {
  if (price === null) return 'Price on request';
  return `${formatMoney(price, currencyCode)} per item · excl. VAT`;
}

export default function CataloguePage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();

  const { user, accessToken, isLoading: authLoading } = useRequireAuth(pathname ?? `/${distributorSlug}`);
  const { quantities, savingItems, syncItem } = useCart();
  const { relationshipStatus, distributor } = useDistributor();
  const currencyCode = distributor?.currencyCode ?? 'GBP';

  const [catalogue, setCatalogue] = useState<CatalogueProductsResponse | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!user || !accessToken) return;
    let cancelled = false;
    setFetchLoading(true);
    setFetchError(null);
    catalogueApi
      .getProducts(distributorSlug, accessToken, debouncedSearch ? { search: debouncedSearch } : undefined)
      .then((res) => {
        if (!cancelled) setCatalogue(res);
      })
      .catch(() => {
        if (!cancelled) setFetchError('Failed to load products. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setFetchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [distributorSlug, user, accessToken, debouncedSearch]);

  const getQty = (id: string) => quantities[id] ?? 0;

  // Full-page spinner only on the initial load — search refetches keep the grid up.
  if (authLoading || (user && fetchLoading && catalogue === null)) {
    return (
      <PageShell center>
        <PageSpinner />
      </PageShell>
    );
  }

  if (!user) return null;

  const products: CatalogueProduct[] = catalogue?.data ?? [];

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .cat-product-row { animation: fadeUp 0.35s ease both; }

        .product-img-placeholder {
          background: linear-gradient(145deg, hsl(var(--color-canvas)) 0%, hsl(var(--color-border)) 100%);
          flex-shrink: 0;
          position: relative;
        }
        .product-img-placeholder::after {
          content: '';
          position: absolute;
          top: 50%; left: 50%;
          width: 35%; height: 35%;
          transform: translate(-50%, -50%);
          background-color: hsl(var(--color-text) / 0.15);
          -webkit-mask-image: url('/logos/stocdup-logo-only.png');
          mask-image: url('/logos/stocdup-logo-only.png');
          -webkit-mask-size: contain;
          mask-size: contain;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-position: center;
        }

        .cat-product-row { transition: background 0.1s; }
        .cat-product-row:active { background: #FAFAFA; }
      `}</style>

      {/* Product list */}
      <PageShell width="full">

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search products…"
          className="mb-5 max-w-sm"
        />

        {fetchError ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-2">
            <p className="text-sm text-[#9CA3AF] leading-relaxed">{fetchError}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 px-6 text-center">
            {debouncedSearch ? (
              <>
                <p className="text-sm font-medium text-[#1A1A1A]">
                  No products match &ldquo;{debouncedSearch}&rdquo;
                </p>
                <p className="mt-1 text-xs text-[#9CA3AF]">Try a different search term</p>
              </>
            ) : (
              <p className="text-sm text-[#9CA3AF]">No products available.</p>
            )}
          </div>
        ) : (
          <ul
            className={`sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-x-5 sm:gap-y-8 transition-opacity ${
              fetchLoading ? 'opacity-60' : ''
            }`}
          >
            {products.map((product, i) => {
              const qty = getQty(product.id);
              const saving = savingItems.has(product.id);
              const hasPrice = product.resolvedPrice !== null || product.price !== null;
              const delay = Math.min(0.08 + i * 0.04, 0.52);

              return (
                <li
                  key={product.id}
                  className="cat-product-row flex items-center border-b border-[#E5E7EB] pb-5 sm:flex-col sm:items-stretch sm:border-b-0 sm:pb-0"
                  style={{ animationDelay: `${delay}s` }}
                >
                  <Link
                    href={`/${distributorSlug}/products/${product.id}`}
                    className="shrink-0 focus:outline-none sm:w-full"
                  >
                    {product.thumbnailUrl ? (
                      <img
                        src={product.thumbnailUrl}
                        alt={product.name}
                        width={96}
                        height={96}
                        loading="lazy"
                        className="h-24 w-24 object-cover sm:h-auto sm:w-full sm:aspect-square"
                      />
                    ) : (
                      <div
                        className="product-img-placeholder h-24 w-24 sm:h-auto sm:w-full sm:aspect-square"
                        aria-hidden="true"
                      />
                    )}
                  </Link>

                  <div className="flex flex-1 flex-col gap-0.5 px-3 py-3 min-w-0 sm:px-0">
                    <Link
                      href={`/${distributorSlug}/products/${product.id}`}
                      className="text-sm font-medium text-[#1A1A1A] leading-snug truncate hover:underline"
                    >
                      {product.name}
                    </Link>
                    {product.sku && (
                      <span className="text-[11px] text-[#C4B5A8] leading-none">{product.sku}</span>
                    )}
                    <span className="text-xs text-[#9CA3AF] mt-0.5">
                      {formatPrice(product.resolvedPrice ?? product.price, currencyCode)}
                    </span>

                    {relationshipStatus === TradeRelationshipStatus.ACTIVE && (
                      <QuantityStepper
                        value={qty}
                        min={0}
                        disabled={!hasPrice}
                        saving={saving}
                        itemLabel={product.name}
                        onChange={(next) => syncItem(product.id, next)}
                        className="mt-2"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PageShell>
    </>
  );
}
