'use client';

import { useState } from 'react';
import { Drawer } from '@/components/Drawer';
import { adminAccountingApi } from '@wholo/admin-api-client';
import { TaxClassification } from '@wholo/types';
import type { AccountingTaxTypeSummary } from '@wholo/types';
import { CLASSIFICATION_LABELS } from '@/lib/tax-classification-labels';

interface Props {
  taxType: AccountingTaxTypeSummary;
  token: string;
  onClose: () => void;
  onImported: () => void;
}

// Xero gives up to 4dp; Stocdup tax type rates are 2dp.
function toTwoDpRate(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '';
}

export function CreateTaxTypeFromExternalDialog({ taxType, token, onClose, onImported }: Props) {
  const [name, setName] = useState(taxType.displayName);
  const [classification, setClassification] = useState<TaxClassification | ''>('');
  const [ratePercentage, setRatePercentage] = useState(toTwoDpRate(taxType.ratePercentage));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!classification) return;
    setSubmitting(true);
    setError(null);
    try {
      await adminAccountingApi.importTaxType(
        taxType.id,
        {
          name: name.trim() || undefined,
          classification,
          ratePercentage: ratePercentage.trim() || undefined,
        },
        token,
      );
      onImported();
    } catch {
      setError('Failed to import this tax type. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <Drawer onClose={onClose} width={480}>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-text">Import as new tax type</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-muted">
          This creates a new Stocdup tax type from &ldquo;{taxType.displayName}&rdquo; and links the two together.
          Xero has no equivalent for classification, so pick the one that applies.
        </p>

        <div>
          <label htmlFor="create-tax-type-name" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Name
          </label>
          <input
            id="create-tax-type-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="create-tax-type-classification" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Classification
          </label>
          <select
            id="create-tax-type-classification"
            value={classification}
            onChange={(e) => setClassification(e.target.value as TaxClassification)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="" disabled>
              Select a classification…
            </option>
            {Object.values(TaxClassification).map((c) => (
              <option key={c} value={c}>
                {CLASSIFICATION_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="create-tax-type-rate" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Rate
          </label>
          <div className="relative">
            <input
              id="create-tax-type-rate"
              type="text"
              inputMode="decimal"
              value={ratePercentage}
              onChange={(e) => setRatePercentage(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              style={{ paddingRight: '1.75rem' }}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">%</span>
          </div>
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
            disabled={submitting || !name.trim() || !classification}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Importing…' : 'Import tax type'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
