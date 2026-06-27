'use client';

import { useState, useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useCart } from '@/lib/cart-context';
import { useDistributor } from '@/lib/distributor-context';
import { catalogueApi } from '@wholo/api-client';
import type { CatalogueProductDetail } from '@wholo/types';
import { PageSubHeader } from '@/components/PageSubHeader';

function formatPrice(price: string | null, resolvedPrice: string | null, productTypeName?: string | null): string {
  const raw = resolvedPrice ?? price;
  if (!raw) return 'Price on request';
  const unit = productTypeName ?? 'item';
  const prefix = resolvedPrice ? '$' : '~$';
  return `${prefix}${parseFloat(raw).toFixed(2)} per ${unit}`;
}

export default function ProductDetailPage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const productId = params.productId as string;
  const pathname = usePathname();

  const { user, accessToken, isLoading: authLoading } = useRequireAuth(
    pathname ?? `/${distributorSlug}/products/${productId}`,
  );
  const { quantities, inCart, savingItems, adjustQty, syncItem } = useCart();
  const { hasRelationship } = useDistributor();

  const [product, setProduct] = useState<CatalogueProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !accessToken) return;
    catalogueApi
      .getProduct(distributorSlug, productId, accessToken)
      .then(setProduct)
      .catch(() => setError('Product could not be loaded.'))
      .finally(() => setLoading(false));
  }, [authLoading, accessToken, distributorSlug, productId]);

  if (authLoading || loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D97036] border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  if (error || !product) {
    return (
      <>
        <PageSubHeader backLabel="All Products" backHref={`/${distributorSlug}/products`} title="Product" />
        <div className="flex flex-1 items-center justify-center py-20 px-6 text-center">
          <p style={{ fontSize: 13, color: '#9CA3AF' }}>{error ?? 'Product not found.'}</p>
        </div>
      </>
    );
  }

  const qty = quantities[productId] ?? 1;
  const added = inCart.has(productId);
  const saving = savingItems.has(productId);
  const hasPrice = product.resolvedPrice !== null || product.price !== null;

  return (
    <>
      <style>{`
        @keyframes pd-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .pd-card { animation: pd-fade-up 0.38s ease both; }

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

        @media (min-width: 481px) {
          .pd-shell { max-width: 480px; margin-left: auto; margin-right: auto; }
        }
      `}</style>

      <PageSubHeader
        backLabel="All Products"
        backHref={`/${distributorSlug}/products`}
        title={product.name}
      />

      <div className="pd-shell w-full flex flex-col pb-12">

        {/* Hero image */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', flexShrink: 0 }}>
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: 'linear-gradient(145deg, #EDE8E1 0%, #DDD4C6 100%)',
            }} aria-hidden="true" />
          )}
        </div>

        {/* Product info card */}
        <div className="pd-card px-4 pt-5 pb-2" style={{ animationDelay: '0.06s' }}>
          <h1 style={{
            fontSize: 20, fontWeight: 700, color: '#1A1A1A',
            letterSpacing: '-0.02em', lineHeight: 1.25, marginBottom: 12,
          }}>
            {product.name}
          </h1>

          {/* Name + price row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            {/* Heart icon (visual only) */}
            <button
              aria-label="Favourite"
              style={{
                border: 'none', background: 'transparent', padding: 0,
                cursor: 'pointer', color: '#C4B5A8', flexShrink: 0,
                display: 'flex', alignItems: 'center',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18 }}>
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
            </button>

            <span style={{ fontSize: 13, color: '#6B7280', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {product.name}
            </span>

            <span style={{ fontSize: 13, color: '#9CA3AF', flexShrink: 0 }}>
              {formatPrice(product.price, product.resolvedPrice, product.productType?.name)}
            </span>
          </div>

          {/* Quantity stepper + add/update */}
          {hasRelationship === true && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <button
                className="stepper-btn"
                aria-label="Decrease quantity"
                onClick={() => adjustQty(productId, -1)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}>
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              <span style={{ minWidth: 22, textAlign: 'center', fontSize: 14, fontWeight: 500, color: '#1A1A1A', userSelect: 'none' }}>
                {qty}
              </span>

              <button
                className="stepper-btn"
                aria-label="Increase quantity"
                onClick={() => adjustQty(productId, 1)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5"  y1="12" x2="19" y2="12" />
                </svg>
              </button>

              <button
                className="order-btn"
                disabled={saving || !hasPrice}
                onClick={() => syncItem(productId, qty)}
                style={{ marginLeft: 4 }}
              >
                {saving ? '…' : added ? 'Update' : 'Add'}
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#E5E7EB', margin: '8px 0' }} />

        {/* About the product */}
        <div className="pd-card px-4 pt-4 pb-6" style={{ animationDelay: '0.14s' }}>
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 10,
          }}>
            About the product
          </p>
          <p style={{ fontSize: 14, color: '#1A1A1A', lineHeight: 1.65 }}>
            {product.description ?? 'No description available.'}
          </p>
        </div>

      </div>
    </>
  );
}
