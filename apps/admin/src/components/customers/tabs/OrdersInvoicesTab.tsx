'use client';

import type { Customer } from '@wholo/types';
import { useAuth } from '@/lib/auth-context';
import { useCustomerPayments } from '@/lib/hooks/use-customer-payments';
import { useCustomerRecentOrders } from '@/lib/hooks/use-customer-recent-orders';
import { AccountActivityCard } from '@/components/dashboard/customer-account/AccountActivityCard';

const RECENT_ORDERS = 20;

// The customer's latest orders and unpaid invoices: the detail behind the
// Dashboard tab's figures. Read-only, so it takes part in none of the page's
// save handling.
export function OrdersInvoicesTab({ customer }: { customer: Customer }) {
  const { accessToken } = useAuth();
  const ready = !!accessToken;
  const payments = useCustomerPayments(customer.organisationId, ready);
  const orders = useCustomerRecentOrders(customer.organisationId, RECENT_ORDERS, ready);

  if (!payments.data) {
    if (payments.error) {
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{payments.error}</div>
          <button type="button" onClick={payments.refetch} className="text-sm font-medium text-primary hover:underline">Try again</button>
        </div>
      );
    }
    return <div className="h-64 animate-pulse rounded-lg border border-border bg-canvas" aria-label="Loading orders and invoices" />;
  }

  return <AccountActivityCard orders={orders.data} ordersError={orders.error} invoices={payments.data.openInvoices} />;
}
