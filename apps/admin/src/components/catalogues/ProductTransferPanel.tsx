'use client';

import { useState, useEffect } from 'react';
import { adminProductsApi } from '@wholo/admin-api-client';
import type { Product } from '@wholo/types';

interface ProductTransferPanelProps {
  token: string;
  currentProductIds: string[];
  onProductIdsChange: (ids: string[]) => void;
  disabled?: boolean;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 text-muted">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className ?? 'h-3.5 w-3.5'}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function ProductTransferPanel({ token, currentProductIds, onProductIdsChange, disabled }: ProductTransferPanelProps) {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [leftSearch, setLeftSearch] = useState('');
  const [rightSearch, setRightSearch] = useState('');
  const [selectedLeft, setSelectedLeft] = useState<Set<string>>(new Set());

  useEffect(() => {
    adminProductsApi.list(token, { limit: 500 })
      .then((r) => setAllProducts(r.data))
      .finally(() => setIsLoading(false));
  }, [token]);

  const inSet = new Set(currentProductIds);

  const rightProducts = allProducts.filter((p) => inSet.has(p.id));
  const leftProducts = allProducts.filter((p) => !inSet.has(p.id));

  const filteredLeft = leftSearch
    ? leftProducts.filter((p) => {
        const q = leftSearch.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q);
      })
    : leftProducts;

  const filteredRight = rightSearch
    ? rightProducts.filter((p) => {
        const q = rightSearch.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q);
      })
    : rightProducts;

  function toggleLeft(id: string) {
    if (disabled) return;
    setSelectedLeft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAdd() {
    if (disabled || selectedLeft.size === 0) return;
    onProductIdsChange([...currentProductIds, ...Array.from(selectedLeft)]);
    setSelectedLeft(new Set());
  }

  function handleRemove(id: string) {
    if (disabled) return;
    onProductIdsChange(currentProductIds.filter((i) => i !== id));
  }

  const addCount = selectedLeft.size;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex gap-4 items-stretch" style={{ height: 420 }}>
      {/* ── Left panel: available products ── */}
      <div className="flex flex-col flex-1 rounded-lg border border-border bg-white overflow-hidden">
        <div className="border-b border-border px-4 py-3 shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Available
            {leftProducts.length > 0 && <span className="ml-1.5 font-normal normal-case">({leftProducts.length})</span>}
          </p>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center">
              <SearchIcon />
            </span>
            <input
              type="text"
              placeholder="Search…"
              value={leftSearch}
              onChange={(e) => setLeftSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              disabled={disabled}
              className="w-full rounded-md border border-border bg-surface pl-8 pr-3 py-1.5 text-sm text-text placeholder-muted/60 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredLeft.length === 0 ? (
            <div className="flex items-center justify-center h-full px-4 text-center">
              <p className="text-sm text-muted">
                {leftSearch ? `No products match "${leftSearch}"` : allProducts.length === 0 ? 'No products found' : 'All products are in this catalogue'}
              </p>
            </div>
          ) : (
            <ul>
              {filteredLeft.map((p, i) => {
                const isSelected = selectedLeft.has(p.id);
                return (
                  <li
                    key={p.id}
                    onClick={() => toggleLeft(p.id)}
                    className={[
                      'flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-border/50 last:border-0 select-none transition-colors',
                      isSelected ? 'bg-[#fff8f3]' : i % 2 === 0 ? 'hover:bg-surface' : 'bg-[#fafafa] hover:bg-surface',
                      disabled ? 'pointer-events-none opacity-60' : '',
                    ].join(' ')}
                  >
                    <div
                      className="shrink-0 flex h-4 w-4 items-center justify-center rounded border transition-colors"
                      style={{
                        backgroundColor: isSelected ? '#D97036' : 'white',
                        borderColor: isSelected ? '#D97036' : '#D1D5DB',
                      }}
                    >
                      {isSelected && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="h-2.5 w-2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{p.name}</p>
                      {p.sku && <p className="text-xs text-muted">{p.sku}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      {p.price ? (
                        <span className="text-xs text-text">${parseFloat(p.price).toFixed(2)}</span>
                      ) : (
                        <span className="text-xs text-muted italic">POA</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Transfer button ── */}
      <div className="flex flex-col items-center justify-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled || addCount === 0}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
          title={addCount > 0 ? `Add ${addCount} product${addCount !== 1 ? 's' : ''}` : 'Select products to add'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
          {addCount > 0 ? `Add ${addCount}` : 'Add →'}
        </button>
        {addCount > 0 && (
          <span className="text-xs text-muted text-center">{addCount} selected</span>
        )}
      </div>

      {/* ── Right panel: catalogue products ── */}
      <div className="flex flex-col flex-1 rounded-lg border border-border bg-white overflow-hidden">
        <div className="border-b border-border px-4 py-3 shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            In catalogue
            {rightProducts.length > 0 && <span className="ml-1.5 font-normal normal-case">({rightProducts.length})</span>}
          </p>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center">
              <SearchIcon />
            </span>
            <input
              type="text"
              placeholder="Search…"
              value={rightSearch}
              onChange={(e) => setRightSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              disabled={disabled}
              className="w-full rounded-md border border-border bg-surface pl-8 pr-3 py-1.5 text-sm text-text placeholder-muted/60 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredRight.length === 0 ? (
            <div className="flex items-center justify-center h-full px-4 text-center">
              <p className="text-sm text-muted">
                {rightSearch ? `No products match "${rightSearch}"` : 'No products in this catalogue yet'}
              </p>
            </div>
          ) : (
            <ul>
              {filteredRight.map((p, i) => (
                <li
                  key={p.id}
                  className={[
                    'group flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 transition-colors',
                    i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]',
                  ].join(' ')}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{p.name}</p>
                    {p.sku && <p className="text-xs text-muted">{p.sku}</p>}
                  </div>
                  <div className="shrink-0 text-right mr-1">
                    {p.price ? (
                      <span className="text-xs text-text">${parseFloat(p.price).toFixed(2)}</span>
                    ) : (
                      <span className="text-xs text-muted italic">POA</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(p.id)}
                    disabled={disabled}
                    className="shrink-0 flex h-6 w-6 items-center justify-center rounded text-muted opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all disabled:cursor-not-allowed"
                    aria-label={`Remove ${p.name}`}
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
