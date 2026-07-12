'use client';

import { useState } from 'react';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingConnectionStatusResponse, AccountingInvoiceTargetStatus } from '@wholo/types';

const STATUS_OPTIONS: { value: AccountingInvoiceTargetStatus; label: string; description: string }[] = [
  {
    value: 'DRAFT',
    label: 'Draft',
    description: 'Invoices are created as drafts for you to review and approve in your accounting system.',
  },
  {
    value: 'SUBMITTED',
    label: 'Submitted for approval',
    description: 'Invoices await approval in your accounting system before they are issued.',
  },
  {
    value: 'AUTHORISED',
    label: 'Authorised',
    description: 'Invoices are issued immediately, ready to send and be paid.',
  },
];

interface AccountingSettingsTabProps {
  token: string;
  connection: AccountingConnectionStatusResponse;
  onConnectionUpdated: (connection: AccountingConnectionStatusResponse) => void;
}

export function AccountingSettingsTab({ token, connection, onConnectionUpdated }: AccountingSettingsTabProps) {
  const [selected, setSelected] = useState<AccountingInvoiceTargetStatus>(connection.invoiceExportTargetStatus);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = selected !== connection.invoiceExportTargetStatus;

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await adminAccountingApi.updateConnectionSettings(
        { invoiceExportTargetStatus: selected },
        token,
      );
      onConnectionUpdated(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl rounded-lg border border-border bg-white p-6">
      <h2 className="text-base font-semibold text-text">Invoice creation</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">
        Choose the status new invoices are created with in your accounting system when a Wholo order is
        accepted.
      </p>

      <fieldset className="space-y-3" disabled={saving}>
        {STATUS_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={[
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              selected === option.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
            ].join(' ')}
          >
            <input
              type="radio"
              name="invoiceExportTargetStatus"
              value={option.value}
              checked={selected === option.value}
              onChange={() => {
                setSelected(option.value);
                setSaved(false);
              }}
              className="mt-1 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium text-text">{option.label}</span>
              <span className="block text-sm text-muted">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="mt-3 text-xs text-muted">
        Submitted and authorised invoices require every line to have an account code in your accounting
        system — link your products on the Products tab first, or invoice creation may fail for unlinked
        products.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && !dirty && <span className="text-sm text-green-700">Saved</span>}
      </div>
    </div>
  );
}
