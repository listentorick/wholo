'use client';

import type { Customer } from '@wholo/types';
import { CustomerCatalogues } from '../CustomerCatalogues';
import { CustomerPriceList } from '../CustomerPriceList';
import { FormCard } from './form-helpers';

interface Props {
  customer: Customer;
  token: string;
  mode: 'tab' | 'wizard';
  onNext?: () => void;
  onBack?: () => void;
}

export function CataloguePricingTab({ customer, token, mode, onNext, onBack }: Props) {
  if (mode === 'wizard') {
    return (
      <div>
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">Catalogue & pricing</h2>
        </div>
        <div className="p-5 space-y-6">
          <p className="text-xs text-muted">
            Platform defaults apply until you configure these. You can change them at any time.
          </p>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Catalogues</p>
            <CustomerCatalogues customerId={customer.id} token={token} />
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Price list</p>
            <CustomerPriceList
              customerId={customer.id}
              token={token}
              currentPriceListId={customer.priceListId}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <button type="button" onClick={onBack} className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text">
            ← Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Next →
          </button>
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
