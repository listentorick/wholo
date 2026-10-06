'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useCan } from '@/lib/permissions';
import { ListPageHeader } from '@/components/list/ListPageHeader';
import { ListTableShell } from '@/components/list/ListTableShell';
import { ListTh } from '@/components/list/ListTh';
import { ListRow } from '@/components/list/ListRow';
import { ListCellLink } from '@/components/list/ListCellLink';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ListSpinner } from '@/components/list/ListSpinner';
import { StatusBadge } from '@/components/list/StatusBadge';
import { adminPaymentTermsApi } from '@wholo/admin-api-client';
import { Permission, type AccountingProvider, type PaymentTerm, type PaymentTermListResponse } from '@wholo/types';
import { accountingProviderLabel, paymentTermLabel } from '@/lib/payment-term-labels';

// ─── Row ──────────────────────────────────────────────────────────────────────

function PaymentTermRow({
  term,
  provider,
  canManage,
  busy,
  onMakeDefault,
}: {
  term: PaymentTerm;
  provider: AccountingProvider | null;
  canManage: boolean;
  busy: boolean;
  onMakeDefault: (term: PaymentTerm) => void;
}) {
  const href = `/payment-terms/${term.id}/edit`;
  const summary =
    term.isSystem && provider
      ? `Stocdup sends no due date; ${accountingProviderLabel(provider)} sets it`
      : term.summary;
  return (
    <ListRow>
      <td className="py-3 pl-5 pr-4">
        <ListCellLink href={href}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="block text-sm font-medium text-text transition-colors group-hover:text-primary">
              {paymentTermLabel(term, provider)}
            </span>
            {term.isSystem && <StatusBadge label="Integration" tone="gray" />}
            {term.isDefault && <StatusBadge label="Default" tone="blue" />}
            {!term.active && <StatusBadge label="Inactive" tone="gray" />}
          </div>
          {/* The rule moves under the name on small screens. */}
          <span className="mt-0.5 block text-xs text-muted sm:hidden">{summary}</span>
        </ListCellLink>
      </td>
      <td className="hidden py-3 px-4 sm:table-cell">
        <ListCellLink href={href} className="text-sm text-text">
          {summary}
        </ListCellLink>
      </td>
      <td className="hidden py-3 px-4 md:table-cell">
        <ListCellLink href={href} className="text-sm text-text">
          {term.customerCount}
        </ListCellLink>
      </td>
      <td className="py-3 pl-4 pr-5 text-right">
        {canManage && term.active && !term.isDefault && (
          <button
            type="button"
            onClick={() => onMakeDefault(term)}
            disabled={busy}
            className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-[hsl(var(--color-border)/20%)] disabled:opacity-50"
          >
            Make default
          </button>
        )}
      </td>
    </ListRow>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PaymentTermsPage() {
  const { accessToken } = useAuth();
  const canManage = useCan()(Permission.CUSTOMERS_MANAGE);
  const [list, setList] = useState<PaymentTermListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    return adminPaymentTermsApi
      .list()
      .then((res) => {
        setList(res);
        setError(null);
      })
      .catch(() => setError('Failed to load payment terms. Please refresh.'));
  }, []);

  useEffect(() => {
    if (accessToken) load();
  }, [accessToken, load]);

  async function makeDefault(term: PaymentTerm) {
    setBusyId(term.id);
    try {
      await adminPaymentTermsApi.makeDefault(term.id);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not change the default.');
    } finally {
      setBusyId(null);
    }
  }

  const provider = list?.accountingProvider ?? null;
  // The integration term is only offered while an integration is connected.
  const terms = list ? list.data.filter((t) => !t.isSystem || provider) : null;
  const hasDefault = terms?.some((t) => t.isDefault) ?? true;

  return (
    <>
      <ListPageHeader
        title="Payment terms"
        count={terms ? terms.length : undefined}
        actions={
          canManage ? (
            <Link
              href="/payment-terms/new"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
            >
              New payment term
            </Link>
          ) : undefined
        }
      />
      <p className="mb-4 max-w-2xl text-sm text-muted">
        When an order is accepted, Stocdup works out its invoice due date from the customer&rsquo;s payment terms and
        sends it with the invoice. Customers use the default unless terms are set on their Account tab.
        {provider &&
          ` ${accountingProviderLabel(provider)} manages due dates until you make one of your own terms the default.`}
      </p>

      {!hasDefault && (
        <p className="mb-4 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No default payment terms. Orders are accepted without a due date until you make one the default.
        </p>
      )}

      {error && <ListErrorBanner message={error} />}
      {!terms && !error ? (
        <ListSpinner />
      ) : terms && terms.length === 0 ? (
        <p className="rounded-lg border border-border bg-white px-5 py-8 text-center text-sm text-muted">
          No payment terms yet.{canManage ? ' Create one, then make it the default.' : ''}
        </p>
      ) : terms ? (
        <ListTableShell>
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <ListTh>Name</ListTh>
                <ListTh className="hidden sm:table-cell">When due</ListTh>
                <ListTh className="hidden md:table-cell">Customers</ListTh>
                <ListTh>
                  <span className="sr-only">Actions</span>
                </ListTh>
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <PaymentTermRow key={t.id} term={t} provider={provider} canManage={canManage} busy={busyId !== null} onMakeDefault={makeDefault} />
              ))}
            </tbody>
          </table>
        </ListTableShell>
      ) : null}
    </>
  );
}
