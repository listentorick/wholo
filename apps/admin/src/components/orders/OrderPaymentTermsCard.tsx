import type { OrderPaymentTerms } from '@wholo/types';
import { accountingProviderLabel, integrationTermLabel } from '@/lib/payment-term-labels';

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const SOURCE_LABELS: Record<OrderPaymentTerms['source'], string> = {
  DISTRIBUTOR_DEFAULT: 'your default',
  TRADER_CUSTOMER_OVERRIDE: 'customer’s terms',
};

interface Props {
  paymentTerms: OrderPaymentTerms;
  /** The due date the accounting system holds now (synced back, ADR-072) — it wins once known. */
  syncedDueDate?: string | null;
}

/**
 * When an order's invoice is due (ADR-075). Stocdup calculates the date at
 * acceptance from the customer's payment terms; once the accounting system
 * has the invoice, its date is shown — it can be changed there.
 */
export function OrderPaymentTermsCard({ paymentTerms, syncedDueDate }: Props) {
  const { calculated, invoiceDate, dueDate, term, source, accountingProvider: provider } = paymentTerms;
  const accounting = provider ? accountingProviderLabel(provider) : 'your accounting software';
  const deferred = term.type === 'ACCOUNTING_SYSTEM_DEFAULT';
  // What the accounting integration reports always wins (ADR-072/075).
  const shownDue = syncedDueDate ?? dueDate;
  // Deferred with no integration to defer to: nothing sets a due date.
  const nothingSet = deferred && !provider && !syncedDueDate;

  let due: string;
  if (shownDue) due = fmtDate(shownDue);
  else if (nothingSet) due = 'No payment terms set';
  else if (deferred) due = integrationTermLabel(provider!);
  else if (!calculated) due = 'Set when the order is accepted';
  else due = '—';

  return (
    <div className="rounded-lg border border-border bg-white px-5 py-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Payment terms</p>
      <dl className="flex flex-col gap-2">
        <div>
          <dt className="text-xs text-muted">Payment due</dt>
          <dd className="text-sm font-medium text-text">{due}</dd>
          {calculated && syncedDueDate && dueDate && syncedDueDate !== dueDate && (
            <dd className="text-xs text-muted">
              Changed in {accounting} (calculated {fmtDate(dueDate)})
            </dd>
          )}
        </div>
        {invoiceDate && (
          <div>
            <dt className="text-xs text-muted">Invoice date</dt>
            <dd className="text-sm text-text">{fmtDate(invoiceDate)}</dd>
          </div>
        )}
        {!nothingSet && (
          <div>
            <dt className="text-xs text-muted">{calculated ? 'Terms' : 'Terms if accepted now'}</dt>
            <dd className="text-sm text-text">
              {deferred ? integrationTermLabel(provider ?? accounting) : term.name}{' '}
              <span className="text-muted">· {SOURCE_LABELS[source]}</span>
            </dd>
            {!deferred && <dd className="text-xs text-muted">{term.summary}</dd>}
          </div>
        )}
      </dl>
    </div>
  );
}
