'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { catalogueApi, cartApi } from '@wholo/api-client';
import type { CatalogueProduct, CatalogueProductsResponse } from '@wholo/types';

function formatPrice(price: string | null): string {
  if (price === null) return 'Price on request';
  return `$${parseFloat(price).toFixed(2)} per item`;
}

export default function CataloguePage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();
  const router = useRouter();

  const { user, isLoading: authLoading } = useRequireAuth(pathname ?? `/${distributorSlug}`);
  const { accessToken } = useAuth();

  const [catalogue, setCatalogue] = useState<CatalogueProductsResponse | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [inCart, setInCart] = useState<Set<string>>(new Set());
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());

  // Load products
  useEffect(() => {
    if (!user) return;
    setFetchLoading(true);
    setFetchError(null);
    catalogueApi
      .getProducts(distributorSlug)
      .then(setCatalogue)
      .catch(() => setFetchError('Failed to load products. Please try again.'))
      .finally(() => setFetchLoading(false));
  }, [distributorSlug, user]);

  // Load cart from server on mount
  useEffect(() => {
    if (!user || !accessToken) return;
    cartApi
      .getCart(distributorSlug, accessToken)
      .then((cart) => {
        const qtys: Record<string, number> = {};
        const ids = new Set<string>();
        for (const item of cart.items) {
          qtys[item.productId] = item.quantity;
          ids.add(item.productId);
        }
        setQuantities(qtys);
        setInCart(ids);
      })
      .catch(() => {});
  }, [distributorSlug, user, accessToken]);

  const getQty = (id: string) => quantities[id] ?? 1;

  const adjustQty = (id: string, delta: number) => {
    setQuantities((prev) => ({
      ...prev,
      [id]: Math.max(1, (prev[id] ?? 1) + delta),
    }));
  };

  const syncItem = useCallback(
    async (productId: string, quantity: number) => {
      if (!accessToken) return;
      setSavingItems((prev) => new Set([...prev, productId]));

      // Optimistic update
      setInCart((prev) => new Set([...prev, productId]));
      setQuantities((prev) => ({ ...prev, [productId]: quantity }));

      try {
        const cart = await cartApi.upsertItem({ distributorSlug, productId, quantity }, accessToken);
        // Reconcile with server response
        const qtys: Record<string, number> = {};
        const ids = new Set<string>();
        for (const item of cart.items) {
          qtys[item.productId] = item.quantity;
          ids.add(item.productId);
        }
        setQuantities((prev) => ({ ...prev, ...qtys }));
        setInCart(ids);
      } catch {
        // Revert optimistic update on error
        setInCart((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      } finally {
        setSavingItems((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    },
    [accessToken, distributorSlug],
  );

  const cartCount = [...inCart].reduce((sum, id) => sum + (quantities[id] ?? 1), 0);

  if (authLoading || (user && fetchLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D97036] border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const products: CatalogueProduct[] = catalogue?.data ?? [];
  const distributorName = catalogue?.distributor.name ?? distributorSlug;

  return (
    <>
      <style>{`
        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .cat-nav        { animation: fadeDown 0.35s ease both; }
        .cat-subheader  { animation: fadeDown 0.35s ease 0.06s both; }
        .cat-product-row { animation: fadeUp 0.35s ease both; }

        /* Stepper circle buttons */
        .stepper-btn {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 1.5px solid #D5D9E0;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #6B7280;
          transition: border-color 0.15s, color 0.15s;
          flex-shrink: 0;
          padding: 0;
        }
        .stepper-btn:hover  { border-color: #D97036; color: #D97036; }
        .stepper-btn:active { background: #FEF3EC; }

        /* Add / Update pill button */
        .order-btn {
          padding: 5px 16px;
          border-radius: 20px;
          border: 1.5px solid #D97036;
          background: transparent;
          color: #D97036;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: background 0.18s, color 0.18s;
          white-space: nowrap;
          line-height: 1.4;
        }
        .order-btn:hover  { background: #D97036; color: #fff; }
        .order-btn:active { background: #C4622A; border-color: #C4622A; color: #fff; }
        .order-btn:disabled { opacity: 0.55; cursor: default; }

        /* Cart badge */
        .cart-badge {
          position: absolute;
          top: -3px;
          right: -4px;
          min-width: 16px;
          height: 16px;
          border-radius: 99px;
          background: #D97036;
          color: #fff;
          font-size: 9.5px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 3px;
          line-height: 1;
        }

        /* Product image placeholder — warm sandy gradient */
        .product-img-placeholder {
          background: linear-gradient(145deg, #EDE8E1 0%, #DDD4C6 100%);
          flex-shrink: 0;
        }

        .cat-product-row { transition: background 0.1s; }
        .cat-product-row:active { background: #FAFAFA; }

        /* On wider screens centre the list as a card */
        @media (min-width: 481px) {
          .cat-shell { max-width: 480px; margin-left: auto; margin-right: auto; }
        }
      `}</style>

      <div className="flex min-h-screen flex-col bg-white">

        {/* ── Top nav ────────────────────────────────────────────── */}
        <nav className="cat-nav sticky top-0 z-20 w-full bg-white border-b border-[#E5E7EB] flex items-center justify-between px-4 py-3.5">

            {/* Left: hamburger + search */}
            <div className="flex items-center gap-1">
              <button className="flex h-9 w-9 items-center justify-center text-[#1A1A1A]" aria-label="Menu">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
                  <line x1="3" y1="6"  x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <button className="flex h-9 w-9 items-center justify-center text-[#9CA3AF]" aria-label="Search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4.5 w-4.5">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            </div>

            {/* Center: distributor name */}
            <button className="flex items-center gap-1.5 text-sm font-medium tracking-wide text-[#1A1A1A]">
              {distributorName}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-[#9CA3AF]">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Right: cart count + icon */}
            <button
              className="relative flex h-9 w-9 items-center justify-center text-[#1A1A1A]"
              aria-label={`Cart, ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
            >
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-1 text-xs font-semibold text-[#1A1A1A] leading-none">
                  {cartCount}
                </span>
              )}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 mt-1">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 01-8 0" />
              </svg>
            </button>

        </nav>

        {/* ── Category sub-header ─────────────────────────────────── */}
        <div className="cat-subheader w-full border-b border-[#E5E7EB] flex items-center justify-between px-4 py-2.5">
          <button
            className="flex items-center gap-1 text-xs text-[#9CA3AF] tracking-wide"
            onClick={() => router.push(`/${distributorSlug}`)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Home
          </button>
          <span className="text-sm font-medium text-[#1A1A1A]">All Products</span>
        </div>

        {/* ── Product list ─────────────────────────────────────────── */}
        <div className="cat-shell flex-1 w-full">

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
                    className="cat-product-row flex items-center border-b border-[#E5E7EB]"
                    style={{ animationDelay: `${delay}s` }}
                  >
                    {/* Product image */}
                    <div
                      className="product-img-placeholder shrink-0"
                      style={{ width: 96, height: 96 }}
                      aria-hidden="true"
                    />

                    {/* Product details */}
                    <div className="flex flex-1 flex-col gap-0.5 px-3 py-3 min-w-0">
                      <span className="text-sm font-medium text-[#1A1A1A] leading-snug truncate">
                        {product.name}
                      </span>
                      {product.sku && (
                        <span className="text-[11px] text-[#C4B5A8] leading-none">{product.sku}</span>
                      )}
                      <span className="text-xs text-[#9CA3AF] mt-0.5">
                        {formatPrice(product.price)}
                      </span>

                      {/* Stepper + button */}
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
                          disabled={saving || product.price === null}
                          onClick={() => syncItem(product.id, qty)}
                        >
                          {saving ? '…' : added ? 'Update' : 'Add'}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

      </div>
    </>
  );
}
