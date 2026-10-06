'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminPaymentTermsApi } from '@wholo/admin-api-client';
import type { PaymentTermListResponse } from '@wholo/types';
import { FieldLabel, SelectInput } from '@/components/form';
import { StatusBadge } from '@/components/list/StatusBadge';
import { paymentTermLabel } from '@/lib/payment-term-labels';

interface Props {
  /** The term set on this customer; '' = none, the customer follows the distributor default. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * A customer's payment terms (ADR-075): the distributor's own terms, then the
 * accounting integration ("Xero manages due date") when one is connected.
 *
 * The select always shows the terms in force — the customer's own, or the
 * distributor default — and the badge beneath says which of the two it is.
 * Picking anything sets it on the customer; "Use default instead" is the only
 * way back, so following the default and being pinned to the same term never
 * look alike.
 */
export function PaymentTermSelect({ value, onChange, disabled, id = 'paymentTermId' }: Props) {
  const [list, setList] = useState<PaymentTermListResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    adminPaymentTermsApi
      .list()
      .then(setList)
      .catch(() => setFailed(true));
  }, []);

  const provider = list?.accountingProvider ?? null;
  // The integration term is only a real choice while an integration is connected;
  // an inactive term can't be newly chosen. Either still shows if this customer is on it.
  const options = (list?.data ?? []).filter((t) => t.id === value || (t.active && (!t.isSystem || provider)));
  const defaultTerm = options.find((t) => t.isDefault);
  const isSet = value !== '';
  const shown = isSet ? value : (defaultTerm?.id ?? '');
  const inForce = options.find((t) => t.id === shown);

  return (
    <div>
      <FieldLabel htmlFor={id}>Payment terms</FieldLabel>
      <SelectInput id={id} value={shown} onChange={(e) => onChange(e.target.value)} disabled={disabled || !list}>
        {/* No integration and no default chosen: nothing is in force yet. */}
        {!inForce && (
          <option value="" disabled>
            {list ? 'No payment terms set' : 'Loading…'}
          </option>
        )}
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {paymentTermLabel(t, provider)}
            {t.isDefault ? ' (default)' : ''}
          </option>
        ))}
      </SelectInput>

      {failed ? (
        <p className="mt-1.5 text-xs text-red-600">Could not load payment terms.</p>
      ) : list ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {isSet ? (
            <>
              <StatusBadge label="Set for this customer" tone="blue" />
              <button
                type="button"
                onClick={() => onChange('')}
                disabled={disabled}
                className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
              >
                Use default instead
              </button>
            </>
          ) : inForce ? (
            <>
              <StatusBadge label="Using default" tone="gray" />
            </>
          ) : (
            <span>
              You have no default payment terms, so orders are accepted without a due date.{' '}
              <Link href="/payment-terms" className="font-medium text-primary underline-offset-2 hover:underline">
                Set up payment terms
              </Link>
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
