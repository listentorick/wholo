'use client';

import { useState, useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useCart } from '@/lib/cart-context';
import { useDistributor } from '@/lib/distributor-context';
import { catalogueApi } from '@wholo/api-client';
import { TradeRelationshipStatus, formatMoney, type CatalogueProductDetail } from '@wholo/types';
import { PageSubHeader } from '@/components/PageSubHeader';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { QuantityStepper } from '@/components/QuantityStepper';

function formatPrice(
  price: string | null,
  resolvedPrice: string | null,
  currencyCode: string,
  productTypeName?: string | null,
): string {
  const raw = resolvedPrice ?? price;
  if (!raw) return 'Price on request';
  const unit = productTypeName ?? 'item';
  const amount = formatMoney(raw, currencyCode);
  const prefixed = resolvedPrice ? amount : `~${amount}`;
  return `${prefixed} per ${unit} · excl. VAT`;
}

export default function ProductDetailPage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const productId = params.productId as string;
  const pathname = usePathname();

  const { user, accessToken, isLoading: authLoading } = useRequireAuth(
    pathname ?? `/${distributorSlug}/products/${productId}`,
  );
  const { quantities, savingItems, syncItem } = useCart();
  const { relationshipStatus, distributor } = useDistributor();
  const currencyCode = distributor?.currencyCode ?? 'GBP';

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
      <PageShell center>
        <PageSpinner />
      </PageShell>
    );
  }

  if (!user) return null;

  if (error || !product) {
    return (
      <>
        <PageSubHeader backLabel="All Products" backHref={`/${distributorSlug}/products`} title="Product" />
        <PageShell center className="px-6 text-center">
          <p style={{ fontSize: 13, color: '#9CA3AF' }}>{error ?? 'Product not found.'}</p>
        </PageShell>
      </>
    );
  }

  const qty = quantities[productId] ?? 0;
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

        .pd-img-placeholder { position: relative; }
        .pd-img-placeholder::after {
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
      `}</style>

      <PageSubHeader
        backLabel="All Products"
        backHref={`/${distributorSlug}/products`}
        title={product.name}
      />

      <PageShell padding="none" className="pb-12">

        {/* Hero image */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', flexShrink: 0 }}>
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              className="pd-img-placeholder"
              style={{
                width: '100%', height: '100%',
                background: 'linear-gradient(145deg, hsl(var(--color-canvas)) 0%, hsl(var(--color-border)) 100%)',
              }}
              aria-hidden="true"
            />
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
              {formatPrice(product.price, product.resolvedPrice, currencyCode, product.productType?.name)}
            </span>
          </div>

          {/* Quantity stepper + add/update */}
          {relationshipStatus === TradeRelationshipStatus.ACTIVE && (
            <QuantityStepper
              value={qty}
              min={0}
              disabled={!hasPrice}
              saving={saving}
              itemLabel={product.name}
              onChange={(next) => syncItem(productId, next)}
              className="mb-2"
            />
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

      </PageShell>
    </>
  );
}
