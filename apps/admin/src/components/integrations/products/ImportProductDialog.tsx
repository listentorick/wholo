'use client';

import { useState } from 'react';
import { Drawer } from '@/components/Drawer';
import { adminAccountingApi, ApiError } from '@wholo/admin-api-client';
import type { AccountingProductSummary } from '@wholo/types';

interface Props {
  product: AccountingProductSummary;
  token: string;
  onClose: () => void;
  onImported: () => void;
}

// Provider prices can carry 4 decimal places; Wholo product prices are 2 dp,
// so the prefill (and anything the user types) is a 2-dp string.
function toTwoDpPrice(value: string | null): string {
  if (!value) return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '';
}

export function ImportProductDialog({ product, token, onClose, onImported }: Props) {
  const [name, setName] = useState(product.displayName);
  const [sku, setSku] = useState(product.externalProductCode ?? '');
  const [price, setPrice] = useState(toTwoDpPrice(product.salesUnitPrice));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skuError, setSkuError] = useState<string | null>(null);

  async function handleImport() {
    setSubmitting(true);
    setError(null);
    setSkuError(null);
    try {
      await adminAccountingApi.importProduct(
        product.id,
        {
          name: name.trim() || undefined,
          sku: sku.trim() || undefined,
          price: price.trim() || undefined,
        },
        token,
      );
      onImported();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSkuError(err.problem.detail ?? 'A product with this SKU already exists — match it instead of importing.');
      } else {
        setError('Failed to import this product. Please try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <Drawer onClose={onClose} width={480}>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-text">Import as new product</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-muted">
          This creates a new Stocdup product from &ldquo;{product.displayName}&rdquo; as a draft. It may still need
          catalogue setup — images, categories and visibility — before customers can see it.
        </p>

        <div>
          <label htmlFor="import-product-name" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Product name
          </label>
          <input
            id="import-product-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="import-product-sku" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            SKU
          </label>
          <input
            id="import-product-sku"
            type="text"
            value={sku}
            onChange={(e) => { setSku(e.target.value); setSkuError(null); }}
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          {skuError && <p className="mt-1 text-xs text-red-600">{skuError}</p>}
        </div>

        <div>
          <label htmlFor="import-product-price" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Price
          </label>
          <input
            id="import-product-price"
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md px-3.5 py-2 text-sm font-medium text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={submitting || !name.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Importing…' : 'Import product'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
