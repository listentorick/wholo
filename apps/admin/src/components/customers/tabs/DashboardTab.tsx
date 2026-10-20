'use client';

import type { Customer } from '@wholo/types';
import type { ActionItem } from '@/components/detail/DetailActionsPanel';
import { CustomerAccountDashboard } from '@/components/dashboard/customer-account/CustomerAccountDashboard';

// The customer page's first tab: the customer's account dashboard. Read-only,
// so it takes part in none of the page's save handling; the page hands it the
// actions its alert offers.
export function DashboardTab({ customer, alertActions }: { customer: Customer; alertActions?: ActionItem[] }) {
  return <CustomerAccountDashboard customer={customer} alertActions={alertActions} />;
}
