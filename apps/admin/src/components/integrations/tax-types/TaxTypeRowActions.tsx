'use client';

import { useState } from 'react';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingTaxTypeSummary } from '@wholo/types';
import { CreateTaxTypeFromExternalDialog } from './CreateTaxTypeFromExternalDialog';
import { MatchExistingTaxTypeDialog } from './MatchExistingTaxTypeDialog';

interface Props {
  taxType: AccountingTaxTypeSummary;
  token: string;
  providerLabel: string;
  onActionComplete: () => void;
}

export function TaxTypeRowActions({ taxType, token, providerLabel, onActionComplete }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'create' | 'match' | null>(null);

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
    if (!taxType.suggestion) return;
    run('confirm', () => adminAccountingApi.confirmTaxTypeSuggestion(taxType.suggestion!.id, token));
  }

  function handleIgnore() {
    run('ignore', () => adminAccountingApi.ignoreTaxType(taxType.id, token));
  }

  function handleUnlink() {
    if (!taxType.mapping) return;
    if (!window.confirm('Unlink this tax type from the accounting tax rate?')) return;
    run('unlink', () => adminAccountingApi.unlinkTaxTypeMapping(taxType.mapping!.id, token));
  }

  const anyBusy = busy !== null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {(taxType.status === 'SUGGESTED' || taxType.status === 'CONFLICT') && (
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

        {taxType.status === 'READY_TO_IMPORT' && (
          <>
            <button
              type="button"
              onClick={() => setDialog('create')}
              disabled={anyBusy}
              className="rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
              style={{ background: '#dbeafe', color: '#1d4ed8' }}
            >
              Create tax type
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

        {taxType.status === 'IGNORED' && (
          <>
            <button
              type="button"
              onClick={() => setDialog('create')}
              disabled={anyBusy}
              className="rounded border border-border px-2.5 py-1 text-xs font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
            >
              Create tax type
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

        {taxType.status === 'LINKED' && taxType.mapping && (
          <>
            <a
              href="/tax-types"
              className="text-xs text-primary hover:underline"
            >
              View tax types
            </a>
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

        {(taxType.status === 'READY_TO_IMPORT' || taxType.status === 'SUGGESTED' || taxType.status === 'CONFLICT') && (
          <button
            type="button"
            onClick={handleIgnore}
            disabled={anyBusy}
            className="text-xs text-muted hover:text-red-600 transition-colors disabled:opacity-50"
          >
            {busy === 'ignore' ? '…' : 'Ignore'}
          </button>
        )}

        {taxType.status === 'INACTIVE' && (
          <span className="text-xs text-muted">No longer in {providerLabel}</span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {dialog === 'create' && (
        <CreateTaxTypeFromExternalDialog
          taxType={taxType}
          token={token}
          onClose={() => setDialog(null)}
          onImported={() => {
            setDialog(null);
            onActionComplete();
          }}
        />
      )}
      {dialog === 'match' && (
        <MatchExistingTaxTypeDialog
          taxType={taxType}
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
