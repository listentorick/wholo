import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Permission, type Customer, type CustomerOrderingBehaviour, type CustomerPaymentSummary } from '@wholo/types';
import { CustomerAccountDashboard } from './CustomerAccountDashboard';

const paymentsHook = vi.fn();
const orderingHook = vi.fn();
vi.mock('@/lib/hooks/use-customer-payments', () => ({ useCustomerPayments: (...a: unknown[]) => paymentsHook(...a) }));
vi.mock('@/lib/hooks/use-customer-ordering-behaviour', () => ({ useCustomerOrderingBehaviour: (...a: unknown[]) => orderingHook(...a) }));

const authState: Record<string, unknown> = {};
vi.mock('@/lib/auth-context', () => ({ useAuth: () => authState }));

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

vi.mock('echarts/core', () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
  use: vi.fn(),
}));
vi.mock('echarts/charts', () => ({ BarChart: {}, CustomChart: {}, LineChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, MarkLineComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

const gbp = (amount: number) => [{ currency: 'GBP', amount }];

const summary: CustomerPaymentSummary = {
  customerId: 'org-1',
  asOf: '2026-10-17',
  outstanding: { amounts: gbp(3840), count: 6, orderCount: 6 },
  overdue: {
    amounts: gbp(1260),
    count: 3,
    oldestDaysOverdue: 36,
    ageing: [
      { bucket: '1-30', amounts: gbp(840), count: 2 },
      { bucket: '31-60', amounts: gbp(420), count: 1 },
      { bucket: '61-90', amounts: [], count: 0 },
      { bucket: '90+', amounts: [], count: 0 },
    ],
    oldest: { orderId: 'o-33', orderNumber: 'ORD-1033', externalInvoiceNumber: 'INV-1042', currency: 'GBP', amountDue: 420, daysOverdue: 36 },
  },
  dueNext7Days: { amounts: gbp(920), count: 1 },
  credit: {
    limit: { currency: 'GBP', amount: 5000 },
    used: { currency: 'GBP', amount: 3840 },
    available: { currency: 'GBP', amount: 1160 },
    usedPercent: 77,
    overLimit: false,
  },
  last90Days: { paidCount: 12, averageDaysToPay: 36, averageDaysAllowed: 30, averageDaysLate: 6, paidOnTimePercent: 75, trend: 'insufficient_history' },
  invoiceTimeline: [],
  overdueHistory: {
    currency: 'GBP',
    since: '2026-10-15',
    days: [
      { date: '2026-10-15', buckets: { '1-30': 840, '31-60': 0, '61-90': 0, '90+': 0 } },
      { date: '2026-10-16', buckets: { '1-30': 840, '31-60': 420, '61-90': 0, '90+': 0 } },
      { date: '2026-10-17', buckets: { '1-30': 840, '31-60': 420, '61-90': 0, '90+': 0 } },
    ],
  },
  notYetInvoiced: { amounts: gbp(250), count: 2 },
  accountingSync: { connected: true, lastSyncedAt: null },
  openInvoices: [
    {
      orderId: 'o-33', orderNumber: 'ORD-1033', externalInvoiceNumber: 'INV-1042', currency: 'GBP',
      total: 420, amountDue: 420, dueDate: '2026-09-11', paymentStatus: 'UNPAID', isOverdue: true, daysOverdue: 36,
    },
    {
      orderId: 'o-40', orderNumber: 'ORD-1040', externalInvoiceNumber: 'INV-1050', currency: 'GBP',
      total: 920, amountDue: 920, dueDate: '2026-10-20', paymentStatus: 'UNPAID', isOverdue: false, daysOverdue: 0,
    },
  ],
};

const behaviour: CustomerOrderingBehaviour = {
  customerId: 'org-1',
  asOf: '2026-10-17',
  periodDays: 30,
  periodStart: '2026-09-18',
  periodEnd: '2026-10-17',
  recency: { lastOrderDate: '2026-10-09', daysSinceLastOrder: 8 },
  frequency: { orders: 4 },
  monetary: { amounts: gbp(2480) },
  productBreadth: { distinctProducts: 18 },
  trend: 'insufficient_history',
};

const result = <T,>(data: T | null, over: Record<string, unknown> = {}) => ({ data, isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(), ...over });
const customer = { id: 'rel-1', organisationId: 'org-1' } as Customer;

describe('CustomerAccountDashboard', () => {
  beforeEach(() => {
    paymentsHook.mockReset().mockReturnValue(result(summary));
    orderingHook.mockReset().mockReturnValue(result(behaviour));
    Object.assign(authState, {
      user: { organisationCurrencyCode: 'GBP', permissions: [Permission.CUSTOMERS_READ, Permission.ANALYTICS_READ] },
      accessToken: 'tok',
    });
  });

  it('shows how exposed we are: owed against the limit, what falls due next, orders not invoiced, what is overdue', () => {
    render(<CustomerAccountDashboard customer={customer} />);

    expect(screen.getByRole('heading', { name: 'How exposed are we?' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '£4,090 in total: £3,840 owed and £250 in orders not invoiced, against a £5,000 credit limit (82% used)' })).toBeInTheDocument();
    // The headline is the bar's total, then what makes it up.
    expect(screen.getByText('£4,090')).toBeInTheDocument();
    expect(screen.getByText('£3,840 owed + £250 not invoiced · limit £5,000 · £910 available (82% used)')).toBeInTheDocument();
    expect(screen.getByText('6 · £3,840')).toBeInTheDocument();
    expect(screen.getByText('3 overdue · 3 not yet due')).toBeInTheDocument();
    expect(screen.getByText('20 Oct')).toBeInTheDocument(); // next payment due
    expect(screen.getByText('£920 · in 3 days')).toBeInTheDocument();
    expect(screen.getByText('£920 due in the next 7 days')).toBeInTheDocument();
    expect(screen.getByText('£250')).toBeInTheDocument(); // orders not invoiced
    expect(screen.getByText('2 accepted orders with no invoice yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check the accounting integration' })).toHaveAttribute('href', '/integrations/accounting');
    expect(screen.getByText('Not invoiced — check accounting')).toBeInTheDocument();
    expect(screen.getByText('£1,260')).toBeInTheDocument(); // overdue now
    expect(screen.getByText('3 invoices · oldest 36 days')).toBeInTheDocument();
  });

  it('says when no credit limit is set, and when accounting is not connected', () => {
    paymentsHook.mockReturnValue(
      result({
        ...summary,
        credit: { ...summary.credit, limit: null, available: null, usedPercent: null },
        accountingSync: { connected: false, lastSyncedAt: null },
      }),
    );
    render(<CustomerAccountDashboard customer={customer} />);
    expect(screen.getByText('£3,840 owed + £250 not invoiced · no credit limit set')).toBeInTheDocument();
    expect(screen.getByText('Accounting not connected')).toBeInTheDocument();
  });

  it('warns when something is overdue or over the limit, offering the page\'s actions', async () => {
    const raise = vi.fn();
    const suspend = vi.fn();
    render(
      <CustomerAccountDashboard
        customer={customer}
        alertActions={[
          { key: 'raise-limit', label: 'Raise limit', onClick: raise },
          { key: 'suspend', label: 'Suspend ordering', tone: 'danger', onClick: suspend, confirm: { prompt: "They won't be able to order.", confirmLabel: 'Yes, suspend' } },
        ]}
      />,
    );

    const alert = screen.getByRole('region', { name: 'Account alert' });
    expect(alert).toHaveTextContent('£1,260 overdue on 3 invoices');
    expect(alert).toHaveTextContent('The oldest is 36 days past due.');

    await userEvent.click(screen.getByRole('button', { name: 'Raise limit' }));
    expect(raise).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Suspend ordering' }));
    expect(suspend).not.toHaveBeenCalled(); // asks first
    await userEvent.click(screen.getByRole('button', { name: 'Yes, suspend' }));
    expect(suspend).toHaveBeenCalledTimes(1);
  });

  it('says when every accepted order is invoiced', () => {
    paymentsHook.mockReturnValue(result({ ...summary, notYetInvoiced: { amounts: [], count: 0 } }));
    render(<CustomerAccountDashboard customer={customer} />);
    expect(screen.getByText('Every accepted order is invoiced')).toBeInTheDocument();
  });

  it('has no alert within the limit with nothing overdue', () => {
    paymentsHook.mockReturnValue(result({ ...summary, overdue: { ...summary.overdue, amounts: [], count: 0, oldestDaysOverdue: null, oldest: null } }));
    render(<CustomerAccountDashboard customer={customer} />);
    expect(screen.queryByRole('region', { name: 'Account alert' })).not.toBeInTheDocument();
  });

  it('shows how they pay: terms against reality, days late, paid on time, and "Not enough history" for the trend', () => {
    paymentsHook.mockReturnValue(
      result({
        ...summary,
        invoiceTimeline: [
          { orderId: 'o-20', orderNumber: 'ORD-1020', orderedOn: '2026-08-20', dueDate: '2026-09-19', paidOn: '2026-09-24', daysLate: 5, currency: 'GBP', total: 310, amountDue: 0 },
          { orderId: 'o-21', orderNumber: 'ORD-1021', orderedOn: '2026-08-21', dueDate: '2026-09-20', paidOn: '2026-09-19', daysLate: 0, currency: 'GBP', total: 200, amountDue: 0 },
        ],
      }),
    );
    render(<CustomerAccountDashboard customer={{ ...customer, paymentTerm: { id: 't', name: 'Net 30', summary: '30 days' } }} />);

    expect(screen.getByRole('heading', { name: 'How do they pay?' })).toBeInTheDocument();
    expect(screen.getByText('12 invoices paid in the last 90 days')).toBeInTheDocument();
    expect(screen.getByText('30d')).toBeInTheDocument();
    expect(screen.getByText('36 days')).toBeInTheDocument();
    expect(screen.getByText('Terms: Net 30')).toBeInTheDocument();
    expect(screen.getByText('6 days')).toBeInTheDocument();
    expect(screen.getByText('Trend: Not enough history')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText('50% paid by the due date')).toBeInTheDocument();
  });

  it('charts when each raised invoice was ordered, due and paid, including unpaid ones', () => {
    paymentsHook.mockReturnValue(
      result({
        ...summary,
        invoiceTimeline: [
          { orderId: 'o-20', orderNumber: 'ORD-1020', orderedOn: '2026-08-20', dueDate: '2026-09-19', paidOn: '2026-09-24', daysLate: 5, currency: 'GBP', total: 310, amountDue: 0 },
          { orderId: 'o-33', orderNumber: 'ORD-1033', orderedOn: '2026-08-12', dueDate: '2026-09-11', paidOn: null, daysLate: 36, currency: 'GBP', total: 420, amountDue: 420 },
        ],
      }),
    );
    render(<CustomerAccountDashboard customer={customer} />);

    expect(screen.getByText('Within terms')).toBeInTheDocument();
    expect(screen.getByText('Due by')).toBeInTheDocument();
    expect(screen.getByText('Late')).toBeInTheDocument();
    expect(screen.getByText('Paid late')).toBeInTheDocument();
    expect(screen.queryByText('No due date')).not.toBeInTheDocument(); // only marks in use are listed
    expect(screen.getByRole('img', { name: /^2 invoices: 0 paid on time, 1 paid late, 0 not yet due, 1 overdue\./ })).toBeInTheDocument();
  });

  it('leaves the timeline out when no invoices have been raised', () => {
    render(<CustomerAccountDashboard customer={customer} />);
    expect(screen.queryByText('Invoices: ordered, due by and paid')).not.toBeInTheDocument();
  });

  it('charts the overdue balance each day, and says "Not enough history" until there are two days of facts', () => {
    const { unmount } = render(<CustomerAccountDashboard customer={customer} />);
    expect(screen.getByRole('img', { name: /Overdue each day from 15 Oct: £840\.00 then, £1,260\.00 today/ })).toBeInTheDocument();
    expect(screen.getByText('Each day since 15 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('£420 · 36 days')).toBeInTheDocument(); // oldest overdue
    unmount();

    paymentsHook.mockReturnValue(result({ ...summary, overdueHistory: { currency: 'GBP', since: null, days: [] } }));
    render(<CustomerAccountDashboard customer={customer} />);
    expect(screen.getByText('Not enough history')).toBeInTheDocument();
    expect(screen.getByText('Each day, last 90 days')).toBeInTheDocument();
  });

  it('shows how they buy, each with its reporting period', () => {
    render(<CustomerAccountDashboard customer={customer} />);

    expect(screen.getByRole('heading', { name: 'How do they buy?' })).toBeInTheDocument();
    expect(screen.getByText('8 days ago')).toBeInTheDocument();
    expect(screen.getByText('4 orders')).toBeInTheDocument();
    expect(screen.getByText('£2,480')).toBeInTheDocument();
    expect(screen.getByText('18 products')).toBeInTheDocument();
    expect(screen.getByText('Last 30 days · Not enough history')).toBeInTheDocument();
    // The reporting period itself (month names vary by ICU build, so only the end date is pinned).
    expect(screen.getByText(/2026 – 17 Oct 2026/)).toBeInTheDocument();
  });

  it('says when accounting data last synced, or that it never has', () => {
    render(<CustomerAccountDashboard customer={customer} />);
    expect(screen.getByText('Accounting data not synced yet')).toBeInTheDocument();
  });

  it('leaves out how they buy, and never asks for it, without analytics:read', () => {
    authState.user = { organisationCurrencyCode: 'GBP', permissions: [Permission.CUSTOMERS_READ] };
    render(<CustomerAccountDashboard customer={customer} />);

    expect(screen.queryByRole('heading', { name: 'How do they buy?' })).not.toBeInTheDocument();
    expect(orderingHook).toHaveBeenCalledWith('org-1', false);
    expect(screen.getByRole('heading', { name: 'How exposed are we?' })).toBeInTheDocument();
  });

  it('refreshes everything from one button', async () => {
    const refetches = [vi.fn(), vi.fn()];
    paymentsHook.mockReturnValue(result(summary, { refetch: refetches[0] }));
    orderingHook.mockReturnValue(result(behaviour, { refetch: refetches[1] }));
    render(<CustomerAccountDashboard customer={customer} />);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    refetches.forEach((r) => expect(r).toHaveBeenCalledTimes(1));
  });

  it('keeps the last data on screen when a refresh fails', () => {
    paymentsHook.mockReturnValue(result(summary, { error: 'Could not load payments.' }));
    render(<CustomerAccountDashboard customer={customer} />);

    expect(screen.getByText('Could not refresh — showing the last loaded data.')).toBeInTheDocument();
    expect(screen.getByText('£1,260')).toBeInTheDocument();
  });

  it('offers a retry when the first load fails', () => {
    paymentsHook.mockReturnValue(result(null, { error: 'Could not load payments.' }));
    render(<CustomerAccountDashboard customer={customer} />);

    expect(screen.getByText('Could not load payments.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
