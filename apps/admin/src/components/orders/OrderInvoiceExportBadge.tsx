'use client';

import { useState } from 'react';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { OrderInvoiceExportSummary } from '@wholo/types';

interface OrderInvoiceExportBadgeProps {
  invoiceExport: OrderInvoiceExportSummary;
  token: string;
}

// A live, actionable retry affordance for a currently-FAILED invoice export.
// Historical state (raised / failed / retried, with a timestamp and who
// retried it) is shown by the order's audit-log Timeline instead — this
// component's only job is the action, not the display. Renders nothing for
// any other status. Retry only queues the export again — the worker picks it
// up asynchronously, so the UI reports "requested", not a result.
export function OrderInvoiceExportBadge({ invoiceExport, token }: OrderInvoiceExportBadgeProps) {
  const [retryRequested, setRetryRequested] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (invoiceExport.status !== 'FAILED') return null;

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await adminAccountingApi.retryInvoiceExport(invoiceExport.id, token);
      setRetryRequested(true);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Failed to request a retry');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Invoice export failed</p>
      <p className="mt-1 text-sm text-amber-800 opacity-85">
        {invoiceExport.errorMessage ?? 'The invoice could not be created.'}
      </p>
      {retryError && <p className="mt-1 text-sm text-red-700">{retryError}</p>}
      <div className="mt-2.5">
        {retryRequested ? (
          <span className="text-sm font-medium text-amber-800">
            Retry requested — the invoice will be re-exported shortly.
          </span>
        ) : (
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            {retrying ? 'Requesting…' : 'Retry invoice export'}
          </button>
        )}
      </div>
    </div>
  );
}
