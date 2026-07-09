'use client';

import { useEffect, useState } from 'react';
import { Drawer } from '@/components/Drawer';
import { adminAccountingApi, adminProductsApi } from '@wholo/admin-api-client';
import type { AccountingProductSummary, Product } from '@wholo/types';

interface Props {
  product: AccountingProductSummary;
  token: string;
  onClose: () => void;
  onMatched: () => void;
}

// Fetches the product list directly and filters client-side, matching the
// contacts MatchExistingCustomerDialog and this app's other modest-volume
// list-filtering conventions rather than adding a new search endpoint for
// this first release.
export function MatchExistingProductDialog({ product, token, onClose, onMatched }: Props) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    adminProductsApi
      .list(token, { limit: 100 })
      .then((res) => setProducts(res.data))
      .catch(() => setLoadError('Failed to load products.'));
  }, [token]);

  const filtered = (products ?? []).filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(query.toLowerCase()),
  );

  async function handleMatch() {
    if (!selected) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await adminAccountingApi.matchProduct(product.id, { productId: selected.id }, token);
      onMatched();
    } catch {
      setActionError('Failed to link this product. It may already be linked to a different accounting product.');
      setSubmitting(false);
    }
  }

  return (
    <Drawer onClose={onClose} width={480}>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-text">Match to existing product</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-muted">
          Link &ldquo;{product.displayName}&rdquo; to a product you already have in Wholo.
        </p>

        <div>
          <label htmlFor="match-product-search" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Search products
          </label>
          <input
            id="match-product-search"
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Search by name or SKU…"
            autoComplete="off"
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {loadError ? (
          <p className="text-xs text-red-600">{loadError}</p>
        ) : products === null ? (
          <div className="flex justify-center py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-md border border-border">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted">No products found.</div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  className={[
                    'block w-full text-left px-4 py-2.5 text-sm border-b border-border last:border-b-0 transition-colors hover:bg-surface',
                    selected?.id === p.id ? 'border-l-[3px] border-l-primary bg-primary/5 pl-[13px]' : '',
                  ].join(' ')}
                >
                  <span className="font-medium text-text">{p.name}</span>
                  {p.sku && <span className="ml-2 text-xs text-muted">{p.sku}</span>}
                </button>
              ))
            )}
          </div>
        )}

        {actionError && <p className="text-xs text-red-600">{actionError}</p>}

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
            onClick={handleMatch}
            disabled={submitting || !selected}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Linking…' : 'Link product'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
