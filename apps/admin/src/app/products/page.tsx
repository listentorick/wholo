'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { adminProductsApi } from '@wholo/admin-api-client';
import type { Product } from '@wholo/types';
import { ProductStatus } from '@wholo/types';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProductStatus }) {
  const styles: Record<ProductStatus, { bg: string; text: string; label: string }> = {
    [ProductStatus.ACTIVE]: { bg: '#dcfce7', text: '#15803d', label: 'Active' },
    [ProductStatus.DRAFT]: { bg: '#fef9c3', text: '#a16207', label: 'Draft' },
    [ProductStatus.ARCHIVED]: { bg: '#f3f4f6', text: '#6b7280', label: 'Archived' },
  };
  const s = styles[status] ?? styles[ProductStatus.DRAFT];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.text }} />
      {s.label}
    </span>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-white py-20 px-8 text-center">
      {/* Illustration */}
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-[#fef3e8]">
        <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
          <rect x="8" y="20" width="48" height="36" rx="4" fill="#f5d9c0" />
          <rect x="8" y="20" width="48" height="10" rx="4" fill="#e8b990" />
          <path d="M24 20v-6a8 8 0 0116 0v6" stroke="#d97036" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="26" y="34" width="12" height="10" rx="2" fill="#d97036" opacity="0.5" />
          <circle cx="48" cy="14" r="7" fill="#d97036" />
          <path d="M45 14l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h2 className="mb-2 text-lg font-semibold text-text">First up: what are you selling?</h2>
      <p className="mb-8 max-w-xs text-sm text-muted leading-relaxed">
        Before you open your store, first you need some products.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-border/20"
        >
          Find products to sell
        </button>
        <Link
          href="/products/new"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Add your products
        </Link>
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary"
      />
    </div>
  );
}

// ─── Product row ──────────────────────────────────────────────────────────────

function ProductRow({ product }: { product: Product }) {
  return (
    <tr className="group border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors cursor-pointer">
      <td className="py-3 pl-5 pr-4">
        <Link href={`/products/${product.id}/edit`} className="block">
          <span className="block font-medium text-text text-sm group-hover:text-primary transition-colors">
            {product.name}
          </span>
          {product.sku && (
            <span className="block text-xs text-muted mt-0.5">SKU: {product.sku}</span>
          )}
        </Link>
      </td>
      <td className="py-3 px-4">
        <Link href={`/products/${product.id}/edit`} className="block">
          <StatusBadge status={product.status} />
        </Link>
      </td>
      <td className="py-3 px-4 text-sm text-muted">
        <Link href={`/products/${product.id}/edit`} className="block">
          {product.productType?.name ?? '—'}
        </Link>
      </td>
      <td className="py-3 pl-4 pr-5 text-sm text-muted">
        <Link href={`/products/${product.id}/edit`} className="block">
          {product.supplier?.name ?? '—'}
        </Link>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async (token: string, nextCursor?: string, append = false) => {
    try {
      const result = await adminProductsApi.list(token, { limit: 20, cursor: nextCursor });
      setProducts((prev) => append ? [...prev, ...result.data] : result.data);
      setCursor(result.pagination.nextCursor ?? undefined);
      setHasMore(result.pagination.hasMore);
      setTotal(result.pagination.total);
    } catch {
      setError('Failed to load products. Please refresh.');
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    setIsLoading(true);
    loadProducts(accessToken).finally(() => setIsLoading(false));
  }, [accessToken, loadProducts]);

  async function handleLoadMore() {
    if (!accessToken || !cursor) return;
    setIsLoadingMore(true);
    await loadProducts(accessToken, cursor, true);
    setIsLoadingMore(false);
  }

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <AdminLayout>
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Products</h1>
          {!isLoading && total > 0 && (
            <p className="mt-0.5 text-sm text-muted">{total} product{total !== 1 ? 's' : ''}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hidden rounded-md border border-border px-3.5 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 sm:block"
          >
            Import
          </button>
          <Link
            href="/products/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Add product
          </Link>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : products.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <th className="py-2.5 pl-5 pr-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  Product
                </th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  Status
                </th>
                <th className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  Type
                </th>
                <th className="py-2.5 pl-4 pr-5 text-xs font-semibold uppercase tracking-wide text-muted">
                  Supplier
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <ProductRow key={product.id} product={product} />
              ))}
            </tbody>
          </table>

          {hasMore && (
            <div className="border-t border-border px-5 py-3.5">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:opacity-50"
              >
                {isLoadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
