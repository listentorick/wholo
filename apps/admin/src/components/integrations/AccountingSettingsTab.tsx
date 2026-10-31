'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type {
  AccountingConnectionStatusResponse,
  AccountingInvoiceTargetStatus,
  AccountingSalesAccount,
  UpdateAccountingConnectionSettingsRequest,
} from '@wholo/types';

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

// The account pull isn't part of the sync status, so nothing signals when the
// first one lands. While the list is empty, keep checking the cache.
const EMPTY_ACCOUNTS_POLL_MS = 5_000;

interface AccountingSettingsTabProps {
  connection: AccountingConnectionStatusResponse;
  onConnectionUpdated: (connection: AccountingConnectionStatusResponse) => void;
  reloadSignal: number;
}

export function AccountingSettingsTab({ connection, onConnectionUpdated, reloadSignal }: AccountingSettingsTabProps) {
  const savedAccount = connection.invoiceDefaultAccount;
  const savedAccountId = savedAccount?.id ?? '';
  const [selected, setSelected] = useState<AccountingInvoiceTargetStatus>(connection.invoiceExportTargetStatus);
  const [selectedAccountId, setSelectedAccountId] = useState(savedAccountId);
  const [accounts, setAccounts] = useState<AccountingSalesAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The accounts Stocdup last synced from the accounting system.
  const loadAccounts = useCallback(async () => {
    setAccountsError(null);
    try {
      setAccounts(await adminAccountingApi.listSalesAccounts());
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'Could not load your accounts');
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts, reloadSignal]);

  const noAccounts = accounts?.length === 0;
  useEffect(() => {
    if (!noAccounts) return;
    const id = setInterval(() => void loadAccounts(), EMPTY_ACCOUNTS_POLL_MS);
    return () => clearInterval(id);
  }, [noAccounts, loadAccounts]);

  const statusDirty = selected !== connection.invoiceExportTargetStatus;
  const accountDirty = selectedAccountId !== savedAccountId;
  const dirty = statusDirty || accountDirty;

  // The saved account may since have been archived in the accounting system —
  // keep it selectable so opening the tab never silently changes the setting.
  const savedAccountInactive = savedAccount !== null && !savedAccount.isActive;

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const body: UpdateAccountingConnectionSettingsRequest = {
      ...(statusDirty && { invoiceExportTargetStatus: selected }),
      ...(accountDirty && { invoiceDefaultAccountId: selectedAccountId || null }),
    };
    try {
      const updated = await adminAccountingApi.updateConnectionSettings(body);
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
        Choose the status new invoices are created with in your accounting system when a Stocdup order is
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

      <h3 className="mt-6 text-sm font-semibold text-text">Default sales account</h3>
      <p className="mt-0.5 mb-3 text-sm text-muted">
        Invoice lines are posted to this account when their product isn&apos;t linked to an item that has a sales
        account of its own. Lines for linked items keep the item&apos;s account.
      </p>

      {accountsError ? (
        <div className="text-sm">
          <p className="text-red-600">{accountsError}</p>
          <button
            type="button"
            onClick={() => void loadAccounts()}
            className="mt-1 font-medium text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <label htmlFor="invoiceDefaultAccount" className="sr-only">
            Default sales account
          </label>
          <select
            id="invoiceDefaultAccount"
            value={selectedAccountId}
            disabled={saving || accounts === null}
            onChange={(e) => {
              setSelectedAccountId(e.target.value);
              setSaved(false);
            }}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {accounts === null ? (
              <option value={selectedAccountId}>Loading accounts…</option>
            ) : (
              <>
                <option value="">None — leave it to your accounting system</option>
                {savedAccountInactive && (
                  <option value={savedAccountId}>
                    {savedAccount.code} — {savedAccount.displayName} (no longer active)
                  </option>
                )}
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} — {account.displayName}
                  </option>
                ))}
              </>
            )}
          </select>
          {savedAccountInactive && selectedAccountId === savedAccountId && (
            <p className="mt-2 text-sm text-red-600">
              This account was archived or deleted in your accounting system, so invoices no longer use it. Choose
              another.
            </p>
          )}
          {accounts !== null && accounts.length === 0 && (
            <p className="mt-2 text-sm text-muted">
              No sales accounts have been synced yet. Run a sync to load them from your accounting system.
            </p>
          )}
        </>
      )}

      <p className="mt-3 text-xs text-muted">
        Submitted and authorised invoices need an account on every line. Choose a default sales account, or link
        your products on the Products tab, so invoices don&apos;t fail for lines without one.
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
