'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useCart } from '@/lib/cart-context';
import { useDistributor } from '@/lib/distributor-context';
import { catalogueApi } from '@wholo/api-client';
import { PageShell, PageSpinner } from '@/components/PageShell';
import type { CatalogueProduct, CatalogueProductsResponse } from '@wholo/types';

function formatPrice(price: string | null): string {
  if (price === null) return 'Price on request';
  return `$${parseFloat(price).toFixed(2)} per item`;
}

export default function CataloguePage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();

  const { user, accessToken, isLoading: authLoading } = useRequireAuth(pathname ?? `/${distributorSlug}`);
  const { quantities, inCart, savingItems, adjustQty, syncItem } = useCart();
  const { hasRelationship } = useDistributor();

  const [catalogue, setCatalogue] = useState<CatalogueProductsResponse | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !accessToken) return;
    setFetchLoading(true);
    setFetchError(null);
    catalogueApi
      .getProducts(distributorSlug, accessToken)
      .then(setCatalogue)
      .catch(() => setFetchError('Failed to load products. Please try again.'))
      .finally(() => setFetchLoading(false));
  }, [distributorSlug, user, accessToken]);

  const getQty = (id: string) => quantities[id] ?? 1;

  if (authLoading || (user && fetchLoading)) {
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

        .stepper-btn {
          width: 30px; height: 30px;
          border-radius: 50%;
          border: 1.5px solid #D5D9E0;
          background: transparent;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #6B7280;
          transition: border-color 0.15s, color 0.15s;
          flex-shrink: 0; padding: 0;
        }
        .stepper-btn:hover  { border-color: #D97036; color: #D97036; }
        .stepper-btn:active { background: #FEF3EC; }

        .order-btn {
          padding: 5px 16px;
          border-radius: 20px;
          border: 1.5px solid #D97036;
          background: transparent;
          color: #D97036;
          font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
          cursor: pointer;
          transition: background 0.18s, color 0.18s;
          white-space: nowrap; line-height: 1.4;
        }
        .order-btn:hover  { background: #D97036; color: #fff; }
        .order-btn:active { background: #C4622A; border-color: #C4622A; color: #fff; }
        .order-btn:disabled { opacity: 0.55; cursor: default; }

        .product-img-placeholder {
          background: linear-gradient(145deg, #EDE8E1 0%, #DDD4C6 100%);
          flex-shrink: 0;
        }

        .cat-product-row { transition: background 0.1s; }
        .cat-product-row:active { background: #FAFAFA; }
      `}</style>

      {/* Product list */}
      <PageShell>

        {fetchError ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-2">
            <p className="text-sm text-[#9CA3AF] leading-relaxed">{fetchError}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex items-center justify-center py-16 px-6">
            <p className="text-sm text-[#9CA3AF]">No products available.</p>
          </div>
        ) : (
          <ul>
            {products.map((product, i) => {
              const qty = getQty(product.id);
              const added = inCart.has(product.id);
              const saving = savingItems.has(product.id);
              const delay = Math.min(0.08 + i * 0.04, 0.52);

              return (
                <li
                  key={product.id}
                  className="cat-product-row flex items-center border-b border-[#E5E7EB] pb-5"
                  style={{ animationDelay: `${delay}s` }}
                >
                  <Link href={`/${distributorSlug}/products/${product.id}`} className="shrink-0 focus:outline-none">
                    {product.thumbnailUrl ? (
                      <img
                        src={product.thumbnailUrl}
                        alt={product.name}
                        width={96}
                        height={96}
                        loading="lazy"
                        style={{ width: 96, height: 96, objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        className="product-img-placeholder"
                        style={{ width: 96, height: 96 }}
                        aria-hidden="true"
                      />
                    )}
                  </Link>

                  <div className="flex flex-1 flex-col gap-0.5 px-3 py-3 min-w-0">
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
                      {formatPrice(product.resolvedPrice ?? product.price)}
                    </span>

                    {hasRelationship === true && (
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          className="stepper-btn"
                          aria-label="Decrease quantity"
                          onClick={() => adjustQty(product.id, -1)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>

                        <span
                          className="text-sm font-medium text-[#1A1A1A] select-none"
                          style={{ minWidth: 18, textAlign: 'center' }}
                        >
                          {qty}
                        </span>

                        <button
                          className="stepper-btn"
                          aria-label="Increase quantity"
                          onClick={() => adjustQty(product.id, 1)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5"  y1="12" x2="19" y2="12" />
                          </svg>
                        </button>

                        <button
                          className="order-btn"
                          disabled={saving || (product.resolvedPrice === null && product.price === null)}
                          onClick={() => syncItem(product.id, qty)}
                        >
                          {saving ? '…' : added ? 'Update' : 'Add'}
                        </button>
                      </div>
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
