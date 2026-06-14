'use client';

import { useState, useEffect } from 'react';
import { adminPriceListsApi } from '@wholo/admin-api-client';
import type { PriceListSummary } from '@wholo/types';

interface CustomerPriceListProps {
  customerId: string;
  token: string;
  currentPriceListId: string | null;
}

export function CustomerPriceList({ customerId, token, currentPriceListId }: CustomerPriceListProps) {
  const [priceLists, setPriceLists] = useState<PriceListSummary[]>([]);
  const [selected, setSelected] = useState<string>(currentPriceListId ?? '');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminPriceListsApi.list(token, { limit: 100 })
      .then((r) => setPriceLists(r.data.filter((pl) => pl.active)))
      .finally(() => setIsLoading(false));
  }, [token]);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await adminPriceListsApi.assignToCustomer(token, customerId, {
        priceListId: selected || null,
      });
      setSavedAt(Date.now());
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span className="text-xs text-muted">Loading price lists…</span>
      </div>
    );
  }

  if (priceLists.length === 0) {
    return (
      <p className="text-sm text-muted">
        No active price lists found.{' '}
        <a href="/pricelists/new" className="text-primary underline-offset-2 hover:underline">Create one first.</a>
      </p>
    );
  }

  const defaultList = priceLists.find((pl) => pl.isDefault);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <select
          value={selected}
          onChange={(e) => { setSelected(e.target.value); setSavedAt(null); }}
          className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
            paddingRight: '30px',
          }}
          disabled={isSaving}
        >
          <option value="">
            {defaultList ? `Default (${defaultList.name})` : '— Use default —'}
          </option>
          {priceLists.map((pl) => (
            <option key={pl.id} value={pl.id}>
              {pl.name}{pl.isDefault ? ' (default)' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {savedAt && (
        <p className="text-xs text-[#15803d]">Price list saved.</p>
      )}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      <p className="text-xs text-muted">
        Leaving this blank uses the distributor&apos;s default price list.
      </p>
    </div>
  );
}
