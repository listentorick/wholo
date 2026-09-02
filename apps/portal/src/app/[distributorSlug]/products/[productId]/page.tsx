'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useCart } from '@/lib/cart-context';
import { useDistributor } from '@/lib/distributor-context';
import { catalogueApi } from '@wholo/api-client';
import {
  TradeRelationshipStatus,
  formatMoney,
  type CatalogueProduct,
  type CatalogueProductDetail,
} from '@wholo/types';
import { PageSubHeader } from '@/components/PageSubHeader';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { QuantityStepper } from '@/components/QuantityStepper';
import { Eyebrow } from '@/components/Eyebrow';

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

function shortPrice(price: string | null, resolvedPrice: string | null, currencyCode: string): string {
  const raw = resolvedPrice ?? price;
  return raw ? formatMoney(raw, currencyCode) : 'Price on request';
}

/** Small placeholder square with the hexagon watermark — used for the hero and the related thumbnails. */
function ImageBox({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return (
    <div className={`aspect-square w-full overflow-hidden rounded-lg border border-border bg-canvas ${className ?? ''}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="pd-img-placeholder h-full w-full" aria-hidden="true" />
      )}
    </div>
  );
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
  const [related, setRelated] = useState<CatalogueProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !accessToken) return;
    catalogueApi
      .getProduct(distributorSlug, productId)
      .then(setProduct)
      .catch(() => setError('Product could not be loaded.'))
      .finally(() => setLoading(false));
  }, [authLoading, accessToken, distributorSlug, productId]);

  useEffect(() => {
    if (authLoading || !accessToken) return;
    catalogueApi
      .getProducts(distributorSlug, { limit: 6 })
      .then((res) => setRelated(res.data.filter((p) => p.id !== productId).slice(0, 4)))
      .catch(() => setRelated([]));
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
        <PageSubHeader backLabel="All products" backHref={`/${distributorSlug}/products`} title="Product" />
        <PageShell center className="px-6 text-center">
          <p className="text-sm text-muted">{error ?? 'Product not found.'}</p>
        </PageShell>
      </>
    );
  }

  const qty = quantities[productId] ?? 0;
  const saving = savingItems.has(productId);
  const hasPrice = product.resolvedPrice !== null || product.price !== null;
  const unitPrice = parseFloat(product.resolvedPrice ?? product.price ?? '0');
  const isActive = relationshipStatus === TradeRelationshipStatus.ACTIVE;

  return (
    <>
      <style>{`
        @keyframes pd-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .pd-card { animation: pd-fade-up 0.32s ease both; }

        .pd-img-placeholder { position: relative; background: linear-gradient(145deg, hsl(var(--color-canvas)) 0%, hsl(var(--color-border)) 100%); }
        .pd-img-placeholder::after {
          content: '';
          position: absolute;
          top: 50%; left: 50%;
          width: 34%; height: 34%;
          transform: translate(-50%, -50%);
          background-color: hsl(var(--color-text) / 0.1);
          -webkit-mask-image: url('/logos/stocdup-logo-only.png');
          mask-image: url('/logos/stocdup-logo-only.png');
          -webkit-mask-size: contain; mask-size: contain;
          -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
          -webkit-mask-position: center; mask-position: center;
        }
      `}</style>

      <PageSubHeader
        backLabel="All products"
        backHref={`/${distributorSlug}/products`}
        title={product.name}
      />

      <PageShell width="full">
        <div className="flex w-full flex-col gap-4 md:gap-5">

          {/* Image + ordering panel */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-7">
            <div className="pd-card w-full md:w-[420px] md:flex-shrink-0">
              <ImageBox src={product.imageUrl} alt={product.name} />
            </div>

            <div
              className="pd-card w-full rounded-lg border border-border bg-surface p-5 shadow-sm md:min-w-0 md:flex-1"
              style={{ animationDelay: '0.05s' }}
            >
              {product.productType?.name && (
                <Eyebrow className="mb-3">{product.productType.name}</Eyebrow>
              )}
              <h1 className="text-xl font-bold leading-snug tracking-[-0.02em] text-navy">
                {product.name}
              </h1>
              {product.sku && (
                <p className="mt-2 text-xs font-medium tracking-[0.02em] text-[#C4B5A8]">{product.sku}</p>
              )}
              <p className="mt-3.5 text-base font-medium text-foreground">
                {formatPrice(product.price, product.resolvedPrice, currencyCode, product.productType?.name)}
              </p>

              <div className="my-5 h-px bg-border" />

              {isActive ? (
                <>
                  <p className="mb-2.5 text-xs font-medium tracking-[0.02em] text-muted">Quantity</p>
                  <QuantityStepper
                    value={qty}
                    min={0}
                    disabled={!hasPrice}
                    saving={saving}
                    itemLabel={product.name}
                    onChange={(next) => syncItem(productId, next)}
                  />
                  {qty > 0 && (
                    <p className="mt-3 text-xs text-muted">
                      In your basket:{' '}
                      <strong className="font-semibold text-foreground">
                        {qty} · {formatMoney(qty * unitPrice, currencyCode)}
                      </strong>
                      . Change the quantity to update it.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">
                  Request access to this supplier to see your pricing and place orders.
                </p>
              )}
            </div>
          </div>

          {/* About the product */}
          <div className="pd-card rounded-lg border border-border bg-surface p-5 shadow-sm" style={{ animationDelay: '0.1s' }}>
            <Eyebrow className="mb-2.5">About the product</Eyebrow>
            <p className="max-w-[74ch] text-sm leading-relaxed text-foreground">
              {product.description ?? 'No description available.'}
            </p>
          </div>

          {/* More from this distributor */}
          {related.length > 0 && (
            <div className="pd-card rounded-lg border border-border bg-surface p-5 shadow-sm" style={{ animationDelay: '0.15s' }}>
              <Eyebrow className="mb-4">More from {distributor?.name ?? 'this supplier'}</Eyebrow>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/${distributorSlug}/products/${r.id}`}
                    className="group flex min-w-0 flex-col"
                  >
                    <ImageBox src={r.thumbnailUrl ?? null} alt={r.name} />
                    <p className="mt-2 truncate text-sm font-medium text-foreground transition-colors group-hover:text-accent">
                      {r.name}
                    </p>
                    <p className="mt-0.5 text-xs text-foreground-tertiary">
                      {shortPrice(r.price, r.resolvedPrice, currencyCode)}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </PageShell>
    </>
  );
}
