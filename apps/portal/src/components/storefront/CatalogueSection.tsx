'use client';

import type { CatalogueProduct } from '@wholo/types';
import { Eyebrow } from '@/components/Eyebrow';
import { Button } from '@/components/Button';
import { PageSpinner } from '@/components/PageShell';
import { SearchInput } from '@/components/SearchInput';
import { ProductCard } from './ProductCard';

interface Props {
  slug: string;
  currencyCode: string;
  canOrder: boolean;
  products: CatalogueProduct[];
  quantities: Record<string, number>;
  savingItems: Set<string>;
  onQtyChange: (productId: string, next: number) => void;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  error: string | null;
  /** Search field — rendered here only on mobile; desktop keeps it in the sticky tab row. */
  search: string;
  onSearchChange: (value: string) => void;
  productCount: number | null;
  searchActive: boolean;
  searchTerm: string;
}

/** Inert sort / stock filters — the catalogue API has no sort or stock param yet. */
function InertSelect({ label, value }: { label: string; value: string }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="hidden sm:inline">{label}</span>
      <select
        disabled
        title="Coming soon"
        className="cursor-not-allowed rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground opacity-70"
      >
        <option>{value}</option>
      </select>
    </label>
  );
}

/**
 * The catalogue block of the storefront — first section, and the scroll target
 * for the "Catalogue" tab. Grid + pagination logic lifted from the old
 * `products/page.tsx`; "Featured" is intentionally omitted for now.
 */
export function CatalogueSection({
  slug,
  currencyCode,
  canOrder,
  products,
  quantities,
  savingItems,
  onQtyChange,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  error,
  search,
  onSearchChange,
  productCount,
  searchActive,
  searchTerm,
}: Props) {
  return (
    <section
      id="catalogue"
      data-scroll-section
      className="mx-auto w-full max-w-[1280px] scroll-mt-[var(--sticky-stack-h,0px)] px-4 py-8 md:px-8"
    >
      <style>{`
        .product-img-placeholder {
          background: linear-gradient(145deg, hsl(var(--color-canvas)) 0%, hsl(var(--color-border)) 100%);
          position: relative;
        }
        .product-img-placeholder::after {
          content: '';
          position: absolute;
          top: 50%; left: 50%;
          width: 35%; height: 35%;
          transform: translate(-50%, -50%);
          background-color: hsl(var(--color-text) / 0.1);
          -webkit-mask-image: url('/logos/stocdup-logo-only.png');
          mask-image: url('/logos/stocdup-logo-only.png');
          -webkit-mask-size: contain; mask-size: contain;
          -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
          -webkit-mask-position: center; mask-position: center;
        }
      `}</style>

      <div className="mb-4 flex items-end justify-between gap-3">
        <Eyebrow>Catalogue</Eyebrow>
        <div className="flex flex-shrink-0 gap-2">
          <InertSelect label="Sort:" value="Best match" />
          <InertSelect label="In stock:" value="All" />
        </div>
      </div>

      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={productCount != null ? `Search all ${productCount} products` : 'Search products…'}
        className="mb-5 md:hidden"
      />

      {error ? (
        <p className="py-16 text-center text-sm text-muted">{error}</p>
      ) : loading && products.length === 0 ? (
        <div className="flex justify-center py-16">
          <PageSpinner />
        </div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center">
          {searchActive ? (
            <>
              <p className="text-sm font-medium text-foreground">No products match &ldquo;{searchTerm}&rdquo;</p>
              <p className="mt-1 text-xs text-muted">Try a different search term</p>
            </>
          ) : (
            <p className="text-sm text-muted">No products available.</p>
          )}
        </div>
      ) : (
        <>
          <ul
            className={`grid grid-cols-2 gap-x-4 gap-y-8 transition-opacity lg:grid-cols-4 ${
              loading ? 'opacity-60' : ''
            }`}
          >
            {products.map((product) => (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  slug={slug}
                  currencyCode={currencyCode}
                  qty={quantities[product.id] ?? 0}
                  saving={savingItems.has(product.id)}
                  canOrder={canOrder}
                  onQtyChange={(next) => onQtyChange(product.id, next)}
                />
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="mt-10 flex justify-center">
              <Button variant="secondary" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more products'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
