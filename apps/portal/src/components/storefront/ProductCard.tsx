'use client';

import Link from 'next/link';
import { formatMoney, type CatalogueProduct } from '@wholo/types';
import { QuantityStepper } from '@/components/QuantityStepper';

export function formatPrice(price: string | null, currencyCode: string): string {
  if (price === null) return 'Price on request';
  return `${formatMoney(price, currencyCode)} per item · excl. VAT`;
}

interface Props {
  product: CatalogueProduct;
  slug: string;
  currencyCode: string;
  qty: number;
  saving: boolean;
  /** Show the quantity stepper — only for an ACTIVE trade relationship. */
  canOrder: boolean;
  onQtyChange: (next: number) => void;
}

/**
 * A single product tile in the storefront catalogue grid. Extracted verbatim
 * (content-wise) from the old `products/page.tsx` list item — thumbnail /
 * placeholder, name, SKU, price line, and the stepper gated on the relationship.
 */
export function ProductCard({ product, slug, currencyCode, qty, saving, canOrder, onQtyChange }: Props) {
  const href = `/${slug}/products/${product.id}`;
  const hasPrice = product.resolvedPrice !== null || product.price !== null;

  return (
    <div className="flex flex-col">
      <Link href={href} className="focus:outline-none">
        {product.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.thumbnailUrl}
            alt={product.name}
            loading="lazy"
            className="aspect-square w-full rounded-lg border border-border object-cover"
          />
        ) : (
          <div
            className="product-img-placeholder aspect-square w-full rounded-lg border border-border"
            aria-hidden="true"
          />
        )}
      </Link>

      <Link
        href={href}
        className="mt-2.5 line-clamp-2 text-sm font-medium leading-snug text-foreground hover:underline"
      >
        {product.name}
      </Link>
      {product.sku && <span className="mt-1 text-[11px] tracking-wide text-foreground-tertiary">{product.sku}</span>}
      <span className="mt-1 text-xs text-muted">
        {formatPrice(product.resolvedPrice ?? product.price, currencyCode)}
      </span>

      {canOrder && (
        <QuantityStepper
          value={qty}
          min={0}
          disabled={!hasPrice}
          saving={saving}
          itemLabel={product.name}
          onChange={onQtyChange}
          className="mt-2.5"
        />
      )}
    </div>
  );
}
