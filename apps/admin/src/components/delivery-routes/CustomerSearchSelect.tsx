'use client';

import { useEffect, useState } from 'react';
import { Drawer } from '@/components/Drawer';
import { adminCustomersApi, adminDeliveryRoutesApi } from '@wholo/admin-api-client';
import type { Customer, DeliveryRouteCustomer } from '@wholo/types';

interface Props {
  routeId: string;
  token: string;
  existingCustomerIds: string[];
  onClose: () => void;
  onAssigned: (routeCustomer: DeliveryRouteCustomer) => void;
}

// Same "fetch a modest-volume list, then filter client-side" convention as
// MatchExistingCustomerDialog — a searchable customer picker among the
// distributor's already-onboarded customers, not a general org search.
export function CustomerSearchSelect({ routeId, token, existingCustomerIds, onClose, onAssigned }: Props) {
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

  const available = (customers ?? []).filter((c) => !existingCustomerIds.includes(c.organisationId));
  const filtered = available.filter((c) =>
    c.organisation.name.toLowerCase().includes(query.toLowerCase()),
  );

  async function handleAssign() {
    if (!selected) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const routeCustomer = await adminDeliveryRoutesApi.assignCustomer(token, routeId, {
        customerId: selected.organisationId,
      });
      onAssigned(routeCustomer);
    } catch {
      setActionError('Failed to add this customer. They may already have an active default route.');
      setSubmitting(false);
    }
  }

  return (
    <Drawer onClose={onClose} width={480}>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-text">Add customers to this route</h2>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label htmlFor="route-customer-search" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Search customers
          </label>
          <input
            id="route-customer-search"
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
              <div className="px-4 py-3 text-sm text-muted">
                {available.length === 0 ? 'All customers already have a route.' : 'No customers found.'}
              </div>
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
                  {c.organisation.addressCity && (
                    <span className="ml-2 text-xs text-muted">{c.organisation.addressCity}</span>
                  )}
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
            onClick={handleAssign}
            disabled={submitting || !selected}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add customer'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
