'use client';

import { useState } from 'react';
import Link from 'next/link';
import { adminAccountingApi, ApiError } from '@wholo/admin-api-client';
import type { AccountingProductSummary } from '@wholo/types';
import { ImportProductDialog } from './ImportProductDialog';
import { MatchExistingProductDialog } from './MatchExistingProductDialog';
import { TaxTypeConflictModal } from './TaxTypeConflictModal';

interface Props {
  product: AccountingProductSummary;
  providerLabel: string;
  onActionComplete: () => void;
}

export function ProductRowActions({ product, providerLabel, onActionComplete }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'import' | 'match' | null>(null);
  const [taxConflictDetail, setTaxConflictDetail] = useState<string | null>(null);

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

  async function handleConfirmMatch(confirmTaxTypeOverride = false) {
    if (!product.suggestion) return;
    setBusy('confirm');
    setError(null);
    try {
      await adminAccountingApi.confirmProductSuggestion(product.suggestion.id, { confirmTaxTypeOverride });
      onActionComplete();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.problem.title === 'TAX_TYPE_CONFLICT') {
        setTaxConflictDetail(err.problem.detail ?? 'This match would change the product’s tax type.');
      } else {
        setError('That action failed. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  }

  function handleIgnore() {
    run('ignore', () => adminAccountingApi.ignoreProduct(product.id));
  }

  function handleUnlink() {
    if (!product.mapping) return;
    if (!window.confirm('Unlink this product from the accounting product?')) return;
    run('unlink', () => adminAccountingApi.unlinkProductMapping(product.mapping!.id));
  }

  const anyBusy = busy !== null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {(product.status === 'SUGGESTED' || product.status === 'CONFLICT') && (
          <>
            <button
              type="button"
              onClick={() => handleConfirmMatch()}
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

        {product.status === 'READY_TO_IMPORT' && (
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

        {product.status === 'IGNORED' && (
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

        {product.status === 'LINKED' && product.mapping && (
          <>
            <Link
              href={`/products/${product.mapping.productId}/edit`}
              className="text-xs text-primary hover:underline"
            >
              View product
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

        {(product.status === 'READY_TO_IMPORT' || product.status === 'SUGGESTED' || product.status === 'CONFLICT') && (
          <button
            type="button"
            onClick={handleIgnore}
            disabled={anyBusy}
            className="text-xs text-muted hover:text-red-600 transition-colors disabled:opacity-50"
          >
            {busy === 'ignore' ? '…' : 'Ignore'}
          </button>
        )}

        {product.status === 'INACTIVE' && (
          <span className="text-xs text-muted">No longer in {providerLabel}</span>
        )}
        {product.status === 'NOT_SOLD' && (
          <span className="text-xs text-muted">Purchase-only in {providerLabel}</span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {dialog === 'import' && (
        <ImportProductDialog
          product={product}
         
          onClose={() => setDialog(null)}
          onImported={() => {
            setDialog(null);
            onActionComplete();
          }}
        />
      )}
      {dialog === 'match' && (
        <MatchExistingProductDialog
          product={product}
         
          onClose={() => setDialog(null)}
          onMatched={() => {
            setDialog(null);
            onActionComplete();
          }}
        />
      )}
      {taxConflictDetail && (
        <TaxTypeConflictModal
          detail={taxConflictDetail}
          submitting={busy === 'confirm'}
          onCancel={() => setTaxConflictDetail(null)}
          onConfirm={() => {
            setTaxConflictDetail(null);
            handleConfirmMatch(true);
          }}
        />
      )}
    </>
  );
}
