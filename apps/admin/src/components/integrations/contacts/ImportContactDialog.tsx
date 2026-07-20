'use client';

import { useState } from 'react';
import { Drawer } from '@/components/Drawer';
import { adminAccountingApi, ApiError } from '@wholo/admin-api-client';
import type { AccountingContactSummary } from '@wholo/types';

interface Props {
  contact: AccountingContactSummary;
  token: string;
  onClose: () => void;
  onImported: () => void;
}

export function ImportContactDialog({ contact, token, onClose, onImported }: Props) {
  const [name, setName] = useState(contact.displayName);
  const [accountNumber, setAccountNumber] = useState(contact.externalContactCode ?? contact.externalAccountNumber ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountNumberError, setAccountNumberError] = useState<string | null>(null);

  async function handleImport() {
    setSubmitting(true);
    setError(null);
    setAccountNumberError(null);
    try {
      await adminAccountingApi.importContact(
        contact.id,
        { name: name.trim() || undefined, accountNumber: accountNumber.trim() || undefined },
        token,
      );
      onImported();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setAccountNumberError(err.problem.detail ?? 'This account number is already in use by another customer.');
      } else {
        setError('Failed to import this contact. Please try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <Drawer onClose={onClose} width={480}>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-text">Import as new customer</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-muted">
          This creates a new Stocdup customer from &ldquo;{contact.displayName}&rdquo;. It won&apos;t create a login
          user or send an invitation — you can add ordering users and invite them once the customer is set up.
        </p>

        <div>
          <label htmlFor="import-name" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Customer name
          </label>
          <input
            id="import-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="import-account-number" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
            Account number
          </label>
          <input
            id="import-account-number"
            type="text"
            value={accountNumber}
            onChange={(e) => { setAccountNumber(e.target.value); setAccountNumberError(null); }}
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          {accountNumberError && <p className="mt-1 text-xs text-red-600">{accountNumberError}</p>}
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
            disabled={submitting || !name.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Importing…' : 'Import customer'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
