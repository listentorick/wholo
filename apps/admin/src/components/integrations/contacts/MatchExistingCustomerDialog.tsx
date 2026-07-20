'use client';

import { useEffect, useState } from 'react';
import { Drawer } from '@/components/Drawer';
import { adminAccountingApi, adminCustomersApi } from '@wholo/admin-api-client';
import type { AccountingContactSummary, Customer } from '@wholo/types';

interface Props {
  contact: AccountingContactSummary;
  token: string;
  onClose: () => void;
  onMatched: () => void;
}

// Deliberately not CustomerSearchStep: that component searches ALL
// organisations and specifically excludes existing customers (it's for
// onboarding a new one). This needs the opposite — picking among the
// distributor's already-onboarded customers — so it fetches the customer
// list directly and filters client-side, matching this app's other
// modest-volume list-filtering conventions rather than adding a new search
// endpoint for this first release.
export function MatchExistingCustomerDialog({ contact, token, onClose, onMatched }: Props) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    adminCustomersApi
      .list(token, { limit: 100 })
      .then((res) => setCustomers(res.data))
      .catch(() => setLoadError('Failed to load customers.'));
  }, [token]);

  const filtered = (customers ?? []).filter((c) =>
    c.organisation.name.toLowerCase().includes(query.toLowerCase()),
  );

  async function handleMatch() {
    if (!selected) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await adminAccountingApi.matchContact(contact.id, { tradeRelationshipId: selected.id }, token);
      onMatched();
    } catch {
      setActionError('Failed to link this contact. The customer may already be linked to a different contact.');
      setSubmitting(false);
    }
  }

  return (
    <Drawer onClose={onClose} width={480}>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-text">Match to existing customer</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-muted">
          Link &ldquo;{contact.displayName}&rdquo; to a customer you already have in Stocdup.
        </p>

        <div>
          <label htmlFor="match-search" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Search customers
          </label>
          <input
            id="match-search"
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
        ) : customers === null ? (
          <div className="flex justify-center py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-md border border-border">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted">No customers found.</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className={[
                    'block w-full text-left px-4 py-2.5 text-sm border-b border-border last:border-b-0 transition-colors hover:bg-surface',
                    selected?.id === c.id ? 'border-l-[3px] border-l-primary bg-primary/5 pl-[13px]' : '',
                  ].join(' ')}
                >
                  <span className="font-medium text-text">{c.organisation.name}</span>
                  {c.accountNumber && <span className="ml-2 text-xs text-muted">{c.accountNumber}</span>}
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
            {submitting ? 'Linking…' : 'Link customer'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
