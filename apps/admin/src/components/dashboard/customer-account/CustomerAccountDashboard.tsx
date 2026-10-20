'use client';

import { Permission, type Customer } from '@wholo/types';
import type { ActionItem } from '@/components/detail/DetailActionsPanel';
import { useAuth } from '@/lib/auth-context';
import { useCan } from '@/lib/permissions';
import { useCustomerPayments } from '@/lib/hooks/use-customer-payments';
import { useCustomerOrderingBehaviour } from '@/lib/hooks/use-customer-ordering-behaviour';
import { RefreshButton } from '../RefreshButton';
import { AccountAlert } from './AccountAlert';
import { ExposureSection } from './ExposureSection';
import { PaymentSection } from './PaymentSection';
import { OrderingSection } from './OrderingSection';
import { accountAlert, accountingSyncText } from './customer-account';

// One customer's account at a glance (ADR-077), as three questions in turn:
// how exposed we are (owed and to be invoiced against the credit limit), how
// they pay, and how they buy, under an alert when they are over the limit or
// overdue. The first tab of the customer page; the orders and invoices behind
// these figures have their own tab. Like the home dashboards, fetched once and
// refreshed manually. The ordering section is sales data (analytics:read) and
// is left out for anyone without it; the API enforces the same.
interface Props {
  customer: Customer;
  /** The page's actions to offer in the alert ("Raise limit", "Suspend ordering"); left out when not allowed. */
  alertActions?: ActionItem[];
}

export function CustomerAccountDashboard({ customer, alertActions = [] }: Props) {
  const { user, accessToken } = useAuth();
  const can = useCan();
  const ready = !!accessToken;
  const canSeeOrdering = can(Permission.ANALYTICS_READ);
  const customerId = customer.organisationId;

  const payments = useCustomerPayments(customerId, ready);
  const ordering = useCustomerOrderingBehaviour(customerId, ready && canSeeOrdering);

  if (!user) return null;
  const currency = user.organisationCurrencyCode ?? 'GBP';
  const summary = payments.data;

  const refreshAll = () => {
    payments.refetch();
    if (canSeeOrdering) ordering.refetch();
  };
  const isRefreshing = payments.isRefreshing || ordering.isRefreshing;

  if (!summary) {
    if (payments.error) {
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{payments.error}</div>
          <button type="button" onClick={payments.refetch} className="text-sm font-medium text-primary hover:underline">Try again</button>
        </div>
      );
    }
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading customer dashboard">
        <div className="grid grid-cols-2 gap-4 2xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-canvas" />)}
        </div>
        <div className="h-56 animate-pulse rounded-lg border border-border bg-canvas" />
      </div>
    );
  }

  const refreshFailed = !!payments.error || (canSeeOrdering && !!ordering.error && !!ordering.data);
  const alert = accountAlert(summary, currency);

  return (
    <div className="space-y-4 xl:space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">{accountingSyncText(summary.accountingSync)}</p>
        <RefreshButton onClick={refreshAll} isRefreshing={isRefreshing} />
      </div>

      {refreshFailed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">Could not refresh — showing the last loaded data.</div>
      )}

      {alert && <AccountAlert title={alert.title} detail={alert.detail} actions={alertActions} />}

      <ExposureSection summary={summary} distributorCurrency={currency} />
      <PaymentSection summary={summary} customer={customer} distributorCurrency={currency} />

      {canSeeOrdering &&
        (ordering.data ? (
          <OrderingSection behaviour={ordering.data} distributorCurrency={currency} />
        ) : ordering.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{ordering.error}</div>
        ) : (
          <div className="h-40 animate-pulse rounded-lg border border-border bg-canvas" aria-label="Loading ordering behaviour" />
        ))}
    </div>
  );
}
