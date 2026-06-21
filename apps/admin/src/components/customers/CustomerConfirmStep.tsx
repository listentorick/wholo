'use client';

import Link from 'next/link';
import type { OrganisationSearchResult } from '@wholo/types';

interface Props {
  org: OrganisationSearchResult;
  existingCustomerId?: string | null;
}

function AddressLines({ org }: { org: OrganisationSearchResult }) {
  const parts = [
    org.addressLine1,
    org.addressLine2,
    [org.addressCity, org.addressState].filter(Boolean).join(' '),
    org.addressPostcode,
    org.addressCountry,
  ].filter(Boolean);

  if (parts.length === 0) {
    return <span className="italic text-muted">No address on file</span>;
  }

  return (
    <>
      {parts.map((line, i) => (
        <span key={i} className="block">{line}</span>
      ))}
    </>
  );
}

export function CustomerConfirmStep({ org, existingCustomerId }: Props) {
  return (
    <div>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-text">Confirm customer details</h2>
      </div>
      <div className="p-5 space-y-4">
        {existingCustomerId && (
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
            <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
            <div className="text-sm">
              <p className="font-medium text-amber-800">Already a customer</p>
              <Link
                href={`/customers/${existingCustomerId}`}
                className="text-amber-700 underline underline-offset-2 hover:text-amber-900 transition-colors"
              >
                View existing relationship →
              </Link>
            </div>
          </div>
        )}

        <div className="rounded-md border border-border overflow-hidden">
          <div className="border-l-[3px] border-l-primary px-4 py-4 space-y-4">
            <p className="text-base font-semibold text-text leading-snug">{org.name}</p>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">Address</p>
              <p className="text-sm text-text leading-relaxed">
                <AddressLines org={org} />
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted">
          These details are managed by the customer and cannot be edited here.
        </p>
      </div>
    </div>
  );
}
