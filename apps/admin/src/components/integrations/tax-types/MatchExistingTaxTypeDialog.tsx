'use client';

import { useEffect, useState } from 'react';
import { Drawer } from '@/components/Drawer';
import { adminAccountingApi, adminTaxTypesApi } from '@wholo/admin-api-client';
import type { AccountingTaxTypeSummary, TaxType } from '@wholo/types';

interface Props {
  taxType: AccountingTaxTypeSummary;
  onClose: () => void;
  onMatched: () => void;
}

// Fetches the tax type list directly and filters client-side — same
// modest-volume convention as MatchExistingProductDialog; there are at most
// a handful of Stocdup tax types per distributor.
export function MatchExistingTaxTypeDialog({ taxType, onClose, onMatched }: Props) {
  const [taxTypes, setTaxTypes] = useState<TaxType[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<TaxType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    adminTaxTypesApi
      .list({ limit: 100 })
      .then((res) => setTaxTypes(res.data))
      .catch(() => setLoadError('Failed to load tax types.'));
  }, []);

  const filtered = (taxTypes ?? []).filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));

  async function handleMatch() {
    if (!selected) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await adminAccountingApi.matchTaxType(taxType.id, { taxTypeId: selected.id });
      onMatched();
    } catch {
      setActionError('Failed to link this tax type. It may already be linked to a different accounting tax type.');
      setSubmitting(false);
    }
  }

  return (
    <Drawer onClose={onClose} width={480}>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-text">Match to existing tax type</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-muted">
          Link &ldquo;{taxType.displayName}&rdquo; to a tax type you already have in Stocdup.
        </p>

        <div>
          <label htmlFor="match-tax-type-search" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Search tax types
          </label>
          <input
            id="match-tax-type-search"
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Search by name…"
            autoComplete="off"
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {loadError ? (
          <p className="text-xs text-red-600">{loadError}</p>
        ) : taxTypes === null ? (
          <div className="flex justify-center py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-md border border-border">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted">No tax types found.</div>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t)}
                  className={[
                    'block w-full text-left px-4 py-2.5 text-sm border-b border-border last:border-b-0 transition-colors hover:bg-surface',
                    selected?.id === t.id ? 'border-l-[3px] border-l-primary bg-primary/5 pl-[13px]' : '',
                  ].join(' ')}
                >
                  <span className="font-medium text-text">{t.name}</span>
                  <span className="ml-2 text-xs text-muted">{t.ratePercentage}%</span>
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
            {submitting ? 'Linking…' : 'Link tax type'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
