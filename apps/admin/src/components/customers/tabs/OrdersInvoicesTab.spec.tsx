import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderStatus, type Customer, type CustomerPaymentSummary, type OrderSummary } from '@wholo/types';
import { OrdersInvoicesTab } from './OrdersInvoicesTab';

const paymentsHook = vi.fn();
const ordersHook = vi.fn();
vi.mock('@/lib/hooks/use-customer-payments', () => ({ useCustomerPayments: (...a: unknown[]) => paymentsHook(...a) }));
vi.mock('@/lib/hooks/use-customer-recent-orders', () => ({ useCustomerRecentOrders: (...a: unknown[]) => ordersHook(...a) }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const summary = {
  openInvoices: [
    {
      orderId: 'o-33', orderNumber: 'ORD-1033', externalInvoiceNumber: 'INV-1042', currency: 'GBP',
      total: 420, amountDue: 420, dueDate: '2026-09-11', paymentStatus: 'UNPAID', isOverdue: true, daysOverdue: 36,
    },
  ],
} as unknown as CustomerPaymentSummary;
const order = { id: 'o-86', orderNumber: 'ORD-1086', status: OrderStatus.DELIVERED, currency: 'GBP', totalAmount: '920.00', submittedAt: '2026-10-08T10:00:00.000Z', createdAt: '2026-10-08T10:00:00.000Z', invoiceSummary: null } as unknown as OrderSummary;

const result = <T,>(data: T | null, over: Record<string, unknown> = {}) => ({ data, isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(), ...over });
const customer = { id: 'rel-1', organisationId: 'org-1' } as Customer;

describe('OrdersInvoicesTab', () => {
  beforeEach(() => {
    paymentsHook.mockReset().mockReturnValue(result(summary));
    ordersHook.mockReset().mockReturnValue(result([order]));
  });

  it("lists the customer's recent orders, and their unpaid invoices on the other tab", async () => {
    render(<OrdersInvoicesTab customer={customer} />);
    expect(screen.getByText('ORD-1086')).toBeInTheDocument();
    expect(ordersHook).toHaveBeenCalledWith('org-1', 20, true);

    await userEvent.click(screen.getByRole('tab', { name: 'Unpaid invoices · 1' }));

    expect(screen.getByText('36 days overdue')).toBeInTheDocument();
    expect(screen.getByText('INV-1042')).toBeInTheDocument();
  });

  it('offers a retry when the invoices cannot be loaded', () => {
    paymentsHook.mockReturnValue(result(null, { error: 'Could not load payments.' }));
    render(<OrdersInvoicesTab customer={customer} />);
    expect(screen.getByText('Could not load payments.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
