import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from './page';
import { adminAnalyticsApi } from '@wholo/admin-api-client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@wholo/admin-api-client', () => ({
  adminAnalyticsApi: {
    orderSummary: vi.fn(),
    orderTrend: vi.fn(),
    customerRankings: vi.fn(),
    productRankings: vi.fn(),
    actionItems: vi.fn(),
  },
  // Sidebar (rendered by AdminLayout on every page) fetches this on mount.
  adminAccountingApi: {
    countContactsNeedingAttention: vi.fn().mockResolvedValue({ count: 0 }),
  },
}));

const authState: Record<string, unknown> = {};
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => authState,
}));

// TopBar (rendered by AdminLayout on every page) reads this.
vi.mock('@/lib/notification-context', () => ({
  useNotifications: () => ({ unreadCount: 0, recent: [], fetchRecent: vi.fn(), markRead: vi.fn() }),
}));

const comparison = (current: number, overrides: Record<string, unknown> = {}) => ({
  current,
  comparison: 0,
  status: 'value',
  absoluteChange: current,
  percentageChange: null,
  ...overrides,
});

const summary = {
  distributorId: 'dist-1',
  timezone: 'UTC',
  period: { key: 'month', start: '2026-03-01', end: '2026-03-15' },
  comparisonPeriod: { key: 'month', start: '2026-02-01', end: '2026-02-15' },
  generatedAt: '2026-03-15T12:00:00.000Z',
  metrics: {
    orderValue: comparison(1300, { comparison: 1000, status: 'value', absoluteChange: 300, percentageChange: 30 }),
    orderCount: comparison(10),
    purchasingCustomers: comparison(4),
    averageOrderValue: comparison(130),
  },
};

const trend = {
  distributorId: 'dist-1',
  timezone: 'UTC',
  period: summary.period,
  comparisonPeriod: summary.comparisonPeriod,
  generatedAt: summary.generatedAt,
  current: [{ date: '2026-03-15', value: 1300, count: 10 }],
  comparison: [{ date: '2026-02-15', value: 1000, count: 8 }],
};

const customerRankings = {
  distributorId: 'dist-1',
  timezone: 'UTC',
  period: summary.period,
  comparisonPeriod: summary.comparisonPeriod,
  generatedAt: summary.generatedAt,
  totalQualifyingValue: 1300,
  top5Share: 1,
  customers: [
    { customerId: 'cust-1', customerName: 'Blackbird Restaurant', value: 1300, orderCount: 10, share: 1, change: comparison(1300) },
  ],
};

const productRankings = {
  distributorId: 'dist-1',
  timezone: 'UTC',
  period: summary.period,
  comparisonPeriod: summary.comparisonPeriod,
  generatedAt: summary.generatedAt,
  products: [{ productId: 'prod-1', productName: 'Cabernet Sauvignon', value: 800, units: 40, reach: 3 }],
  nonSellingProducts: [{ productId: 'prod-2', productName: 'Merlot' }],
};

const actionItems = {
  distributorId: 'dist-1',
  generatedAt: summary.generatedAt,
  awaitingAcceptance: [{ id: 'order-1', orderNumber: 'ORD-1001', traderCustomerId: 'cust-1', submittedAt: null, totalAmount: '100.00' }],
  dueForFulfilment: [],
  invoiceFailures: [],
  neverOrdered: [{ customerId: 'cust-2', customerName: 'The Anchor Pub' }],
};

function setAuth() {
  Object.assign(authState, {
    user: { firstName: 'Ada', lastName: 'Acme', organisationName: 'Acme Wines' },
    accessToken: 'tok-1',
    isLoading: false,
    onboardingRequired: false,
  });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuth();
    (adminAnalyticsApi.orderSummary as ReturnType<typeof vi.fn>).mockResolvedValue(summary);
    (adminAnalyticsApi.orderTrend as ReturnType<typeof vi.fn>).mockResolvedValue(trend);
    (adminAnalyticsApi.customerRankings as ReturnType<typeof vi.fn>).mockResolvedValue(customerRankings);
    (adminAnalyticsApi.productRankings as ReturnType<typeof vi.fn>).mockResolvedValue(productRankings);
    (adminAnalyticsApi.actionItems as ReturnType<typeof vi.fn>).mockResolvedValue(actionItems);
  });

  it('greets the user and loads all five analytics calls for the default (month) period', async () => {
    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Welcome back, Ada')).toBeInTheDocument());
    expect(adminAnalyticsApi.orderSummary).toHaveBeenCalledWith({ period: 'month' }, 'tok-1');
    expect(adminAnalyticsApi.actionItems).toHaveBeenCalledWith('tok-1');
  });

  it('renders stat tiles with values and the growth percentage', async () => {
    render(<DashboardPage />);

    // Scope to the stat tile itself — "£1,300" also legitimately appears as
    // the trend chart's end-label, so a page-wide text search is ambiguous.
    const orderValueTile = (await screen.findByText('Order value')).closest('div');
    expect(orderValueTile).toHaveTextContent('£1,300');
    expect(orderValueTile).toHaveTextContent('30.0% vs. previous period');
  });

  it('re-fetches every endpoint when the period selector changes', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(adminAnalyticsApi.orderSummary).toHaveBeenCalledTimes(1));

    await userEvent.click(await screen.findByRole('radio', { name: 'Last 7 days' }));

    await waitFor(() => expect(adminAnalyticsApi.orderSummary).toHaveBeenCalledWith({ period: 'rolling7' }, 'tok-1'));
    expect(adminAnalyticsApi.customerRankings).toHaveBeenCalledWith({ period: 'rolling7', limit: 10 }, 'tok-1');
  });

  it('renders top customers and products linking to their detail pages', async () => {
    render(<DashboardPage />);

    const customerLink = await screen.findByRole('link', { name: 'Blackbird Restaurant' });
    expect(customerLink).toHaveAttribute('href', '/customers/cust-1');
    const productLink = screen.getByRole('link', { name: 'Cabernet Sauvignon' });
    expect(productLink).toHaveAttribute('href', '/products/prod-1');
  });

  it('lists action items, including a never-ordered customer and an order awaiting acceptance', async () => {
    render(<DashboardPage />);

    expect(await screen.findByText('ORD-1001')).toBeInTheDocument();
    expect(screen.getByText(/has never placed an order/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The Anchor Pub' })).toHaveAttribute('href', '/customers/cust-2');
  });

  it('shows an error banner when loading fails', async () => {
    (adminAnalyticsApi.orderSummary as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    render(<DashboardPage />);

    expect(await screen.findByText('Failed to load dashboard data.')).toBeInTheDocument();
  });
});
