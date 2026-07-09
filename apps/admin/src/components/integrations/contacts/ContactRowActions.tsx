'use client';

import { useState } from 'react';
import Link from 'next/link';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingContactSummary } from '@wholo/types';
import { ImportContactDialog } from './ImportContactDialog';
import { MatchExistingCustomerDialog } from './MatchExistingCustomerDialog';

interface Props {
  contact: AccountingContactSummary;
  token: string;
  onActionComplete: () => void;
}

export function ContactRowActions({ contact, token, onActionComplete }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'import' | 'match' | null>(null);

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      onActionComplete();
    } catch {
      setError('That action failed. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  function handleConfirmMatch() {
    if (!contact.suggestion) return;
    run('confirm', () => adminAccountingApi.confirmSuggestion(contact.suggestion!.id, token));
  }

  function handleIgnore() {
    run('ignore', () => adminAccountingApi.ignoreContact(contact.id, token));
  }

  function handleUnlink() {
    if (!contact.mapping) return;
    if (!window.confirm('Unlink this customer from the accounting contact?')) return;
    run('unlink', () => adminAccountingApi.unlinkMapping(contact.mapping!.id, token));
  }

  const anyBusy = busy !== null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {(contact.status === 'SUGGESTED' || contact.status === 'CONFLICT') && (
          <>
            <button
              type="button"
              onClick={handleConfirmMatch}
              disabled={anyBusy}
              className="rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
              style={{ background: '#dcfce7', color: '#15803d' }}
            >
              {busy === 'confirm' ? '…' : 'Confirm match'}
            </button>
            <button
              type="button"
              onClick={() => setDialog('match')}
              disabled={anyBusy}
              className="rounded border border-border px-2.5 py-1 text-xs font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
            >
              Match differently
            </button>
          </>
        )}

        {contact.status === 'READY_TO_IMPORT' && (
          <>
            <button
              type="button"
              onClick={() => setDialog('import')}
              disabled={anyBusy}
              className="rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
              style={{ background: '#dbeafe', color: '#1d4ed8' }}
            >
              Import as new
            </button>
            <button
              type="button"
              onClick={() => setDialog('match')}
              disabled={anyBusy}
              className="rounded border border-border px-2.5 py-1 text-xs font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
            >
              Match to existing
            </button>
          </>
        )}

        {contact.status === 'IGNORED' && (
          <>
            <button
              type="button"
              onClick={() => setDialog('import')}
              disabled={anyBusy}
              className="rounded border border-border px-2.5 py-1 text-xs font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
            >
              Import as new
            </button>
            <button
              type="button"
              onClick={() => setDialog('match')}
              disabled={anyBusy}
              className="rounded border border-border px-2.5 py-1 text-xs font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
            >
              Match to existing
            </button>
          </>
        )}

        {contact.status === 'LINKED' && contact.mapping && (
          <>
            <Link
              href={`/customers/${contact.mapping.tradeRelationshipId}`}
              className="text-xs text-primary hover:underline"
            >
              View customer
            </Link>
            <button
              type="button"
              onClick={handleUnlink}
              disabled={anyBusy}
              className="rounded border border-border px-2.5 py-1 text-xs font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
            >
              {busy === 'unlink' ? '…' : 'Unlink'}
            </button>
          </>
        )}

        {(contact.status === 'READY_TO_IMPORT' || contact.status === 'SUGGESTED' || contact.status === 'CONFLICT') && (
          <button
            type="button"
            onClick={handleIgnore}
            disabled={anyBusy}
            className="text-xs text-muted hover:text-red-600 transition-colors disabled:opacity-50"
          >
            {busy === 'ignore' ? '…' : 'Ignore'}
          </button>
        )}

        {contact.status === 'ARCHIVED' && <span className="text-xs text-muted">Archived in Xero</span>}
        {contact.status === 'NOT_A_CUSTOMER' && <span className="text-xs text-muted">Supplier in Xero</span>}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {dialog === 'import' && (
        <ImportContactDialog
          contact={contact}
          token={token}
          onClose={() => setDialog(null)}
          onImported={() => {
            setDialog(null);
            onActionComplete();
          }}
        />
      )}
      {dialog === 'match' && (
        <MatchExistingCustomerDialog
          contact={contact}
          token={token}
          onClose={() => setDialog(null)}
          onMatched={() => {
            setDialog(null);
            onActionComplete();
          }}
        />
      )}
    </>
  );
}
