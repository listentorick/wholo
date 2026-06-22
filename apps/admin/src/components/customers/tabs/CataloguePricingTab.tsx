'use client';

import { useState, useEffect } from 'react';
import type { Customer, PriceListSummary } from '@wholo/types';
import { adminPriceListsApi } from '@wholo/admin-api-client';
import { CustomerCatalogues } from '../CustomerCatalogues';
import { CustomerPriceList } from '../CustomerPriceList';
import { FormCard, WizardSectionHeading } from './form-helpers';

interface Props {
  customer: Customer;
  token: string;
  mode: 'tab' | 'wizard';
  onNext?: () => void;
  onBack?: () => void;
}

export function CataloguePricingTab({ customer, token, mode, onNext, onBack }: Props) {
  const [priceLists, setPriceLists] = useState<PriceListSummary[]>([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState(customer.priceListId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'wizard') return;
    adminPriceListsApi
      .list(token, { limit: 100 })
      .then((res) => setPriceLists(res.data.filter((pl) => pl.active)))
      .catch(() => {});
  }, [token, mode]);

  async function handleNext() {
    setSaving(true);
    setError(null);
    try {
      await adminPriceListsApi.assignToCustomer(token, customer.id, {
        priceListId: selectedPriceListId || null,
      });
      onNext?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (mode === 'wizard') {
    const defaultList = priceLists.find((pl) => pl.isDefault);

    return (
      <div>
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">Catalogue & pricing</h2>
        </div>
        <div className="p-5 space-y-6">
          <p className="text-xs text-muted">
            Platform defaults apply until you configure these. You can change them at any time from the Catalogue & Pricing tab.
          </p>
          <div>
            <WizardSectionHeading>Catalogues</WizardSectionHeading>
            <CustomerCatalogues customerId={customer.id} token={token} />
          </div>
          <div className="space-y-2">
            <WizardSectionHeading>Price list</WizardSectionHeading>
            <select
              value={selectedPriceListId}
              onChange={(e) => setSelectedPriceListId(e.target.value)}
              disabled={saving}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
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
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <button type="button" onClick={onBack} className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text">
            ← Back
          </button>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs font-medium text-red-500">{error}</span>}
            <button
              type="button"
              onClick={handleNext}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FormCard title="Catalogues">
        <CustomerCatalogues customerId={customer.id} token={token} />
      </FormCard>
      <FormCard title="Price list">
        <CustomerPriceList
          customerId={customer.id}
          token={token}
          currentPriceListId={customer.priceListId}
        />
      </FormCard>
    </div>
  );
}
