import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalesDashboard as DashboardPage } from './SalesDashboard';
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
  },
  // Sidebar (rendered by AdminLayout on every page) fetches these on mount.
  adminAccountingApi: {
    countContactsNeedingAttention: vi.fn().mockResolvedValue({ count: 0 }),
  },
  adminOrdersApi: {
    countOrdersNeedingAttention: vi.fn().mockResolvedValue({ count: 0 }),
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

// OrderTrendChart (rendered on this page) needs a real canvas backend, which
// jsdom doesn't provide — mock it at the module boundary, same as
// OrderTrendChart.spec.tsx.
vi.mock('echarts/core', () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
  use: vi.fn(),
}));
vi.mock('echarts/charts', () => ({ LineChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

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


function setAuth() {
  Object.assign(authState, {
    user: { firstName: 'Ada', lastName: 'Acme', organisationName: 'Acme Wines' },
    accessToken: 'tok-1',
    isLoading: false,
    onboardingRequired: false,
  });
}

describe('SalesDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuth();
    (adminAnalyticsApi.orderSummary as ReturnType<typeof vi.fn>).mockResolvedValue(summary);
    (adminAnalyticsApi.orderTrend as ReturnType<typeof vi.fn>).mockResolvedValue(trend);
    (adminAnalyticsApi.customerRankings as ReturnType<typeof vi.fn>).mockResolvedValue(customerRankings);
    (adminAnalyticsApi.productRankings as ReturnType<typeof vi.fn>).mockResolvedValue(productRankings);
  });

  it('loads the four analytics calls for the default (month) period', async () => {
    render(<DashboardPage />);

    await waitFor(() => expect(adminAnalyticsApi.productRankings).toHaveBeenCalled());
    expect(adminAnalyticsApi.orderSummary).toHaveBeenCalledWith({ period: 'month' });
    expect(adminAnalyticsApi.orderTrend).toHaveBeenCalledWith({ period: 'month' });
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

    await waitFor(() => expect(adminAnalyticsApi.orderSummary).toHaveBeenCalledWith({ period: 'rolling7' }));
    expect(adminAnalyticsApi.customerRankings).toHaveBeenCalledWith({ period: 'rolling7', limit: 10 });
  });

  it('renders top customers and products linking to their detail pages', async () => {
    render(<DashboardPage />);

    const customerLink = await screen.findByRole('link', { name: 'Blackbird Restaurant' });
    expect(customerLink).toHaveAttribute('href', '/customers/cust-1');
    const productLink = screen.getByRole('link', { name: 'Cabernet Sauvignon' });
    expect(productLink).toHaveAttribute('href', '/products/prod-1/edit');
  });

  it("no longer carries a 'Needs attention' list: what needs doing lives on the Delivery dashboard", async () => {
    render(<DashboardPage />);

    await screen.findByText('Cabernet Sauvignon');
    expect(screen.queryByText(/needs attention/i)).not.toBeInTheDocument();
  });

  it('shows an error banner when loading fails', async () => {
    (adminAnalyticsApi.orderSummary as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    render(<DashboardPage />);

    expect(await screen.findByText('Failed to load dashboard data.')).toBeInTheDocument();
  });

  it('puts the period selector on the same bar as the dashboard tabs', async () => {
    const nav = { tabs: [{ key: 'delivery' as const, label: 'Delivery' }, { key: 'sales' as const, label: 'Sales' }], activeKey: 'sales' as const, onChange: vi.fn() };
    render(<DashboardPage nav={nav} />);

    const selector = await screen.findByRole('radiogroup', { name: /reporting period/i });
    const bar = selector.closest('div.border-b')!;
    expect(bar.contains(screen.getByRole('button', { name: 'Sales' }))).toBe(true);
    expect(bar.contains(screen.getByRole('button', { name: 'Delivery' }))).toBe(true);
  });

  it('shows the tabs while the numbers are still loading', () => {
    (adminAnalyticsApi.orderSummary as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const nav = { tabs: [{ key: 'delivery' as const, label: 'Delivery' }, { key: 'sales' as const, label: 'Sales' }], activeKey: 'sales' as const, onChange: vi.fn() };
    render(<DashboardPage nav={nav} />);

    expect(screen.getByRole('button', { name: 'Delivery' })).toBeInTheDocument();
  });
});
