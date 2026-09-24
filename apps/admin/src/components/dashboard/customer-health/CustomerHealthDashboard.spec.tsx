import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CustomerHealthResponse } from '@wholo/types';
import { CustomerHealthDashboard } from './CustomerHealthDashboard';

const hook = vi.fn();
vi.mock('@/lib/hooks/use-customer-health', () => ({ useCustomerHealth: (...a: unknown[]) => hook(...a) }));

const authState: Record<string, unknown> = {};
vi.mock('@/lib/auth-context', () => ({ useAuth: () => authState }));

vi.mock('echarts/core', () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
  use: vi.fn(),
}));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

const data: CustomerHealthResponse = {
  distributorId: 'dist-1',
  timezone: 'UTC',
  generatedAt: '2026-09-24T12:00:00.000Z',
  tiles: { activeCustomers90d: 3, atRiskCount: 1, salesLast30d: 1200 },
  tierCounts: { healthy: 1, watch: 1, at_risk: 1 },
  needingAttention: [
    { customerId: 'rel-1', customerName: 'Never Orders Ltd', tier: 'at_risk', reasons: [{ code: 'NEVER_ORDERED', category: 'no_relationship_yet', severity: 'at_risk', text: 'No orders since becoming a customer 70 days ago' }], spend30d: 0, lastOrderDate: null },
    { customerId: 'rel-2', customerName: 'Slowing Co', tier: 'watch', reasons: [{ code: 'SPEND_DOWN', category: 'customer_behaviour', severity: 'watch', text: 'Spend down 20% vs. the previous 30 days' }], spend30d: 800, lastOrderDate: '2026-09-10' },
  ],
  buyingTrends: [{ weekStart: '2026-09-21', expectedOrders: 5, placedOrders: 4 }],
  salesConcentration: {
    periodDays: 90, totalValue: 1000, top5Share: 0.8, otherValue: 200, otherShare: 0.2,
    topCustomers: [{ customerId: 'rel-9', customerName: 'Big Buyer Ltd', tier: 'healthy', value: 800, share: 0.8 }],
  },
};

const result = (over: Record<string, unknown> = {}) => ({ data, isLoading: false, isRefreshing: false, error: null, refetch: vi.fn(), ...over });

describe('CustomerHealthDashboard', () => {
  beforeEach(() => {
    hook.mockReset();
    Object.assign(authState, { user: { organisationCurrencyCode: 'GBP' }, accessToken: 'tok' });
  });

  it('holds the load until auth is ready', () => {
    hook.mockReturnValue(result({ data: null, isLoading: true }));
    authState.accessToken = null;
    render(<CustomerHealthDashboard />);
    expect(hook).toHaveBeenCalledWith(false);
  });

  it('shows a loading state on the first load', () => {
    hook.mockReturnValue(result({ data: null, isLoading: true }));
    render(<CustomerHealthDashboard />);
    expect(screen.getByLabelText('Loading customer health')).toBeInTheDocument();
  });

  it('shows the error and a way to retry when the first load fails', async () => {
    const refetch = vi.fn();
    hook.mockReturnValue(result({ data: null, error: 'Could not load customer health.', refetch }));
    render(<CustomerHealthDashboard />);

    expect(screen.getByText('Could not load customer health.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders the tiles, tiers, flagged customers and buying trends', () => {
    hook.mockReturnValue(result());
    render(<CustomerHealthDashboard />);

    expect(screen.getByText('Sales, last 30 days').closest('div')).toHaveTextContent('£1,200');
    expect(screen.getByText('Customer health')).toBeInTheDocument();
    expect(screen.getAllByText('Never Orders Ltd').length).toBeGreaterThan(0);
    expect(screen.getByText('Buying trends')).toBeInTheDocument();
    expect(screen.getByText('Where our sales come from')).toBeInTheDocument();
  });

  it('narrows the flagged list to at-risk customers when the at-risk tile is clicked', async () => {
    hook.mockReturnValue(result());
    render(<CustomerHealthDashboard />);

    await userEvent.click(screen.getByRole('button', { name: /customers at risk/i }));

    expect(screen.queryByText('Slowing Co')).not.toBeInTheDocument();
    expect(screen.getAllByText('Never Orders Ltd').length).toBeGreaterThan(0);
  });

  it('keeps the last data on screen and says so when a refresh fails', () => {
    hook.mockReturnValue(result({ error: 'Could not load customer health.' }));
    render(<CustomerHealthDashboard />);

    expect(screen.getByText(/could not refresh/i)).toBeInTheDocument();
    expect(screen.getAllByText('Never Orders Ltd').length).toBeGreaterThan(0);
  });

  it('sits on the same bar as the dashboard tabs, and keeps them while loading', () => {
    hook.mockReturnValue(result({ data: null, isLoading: true }));
    const nav = {
      tabs: [{ key: 'delivery' as const, label: 'Delivery' }, { key: 'customers' as const, label: 'Customers' }, { key: 'sales' as const, label: 'Sales' }],
      activeKey: 'customers' as const,
      onChange: vi.fn(),
    };
    render(<CustomerHealthDashboard nav={nav} />);

    expect(screen.getByRole('button', { name: 'Delivery' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sales' })).toBeInTheDocument();
  });

  it('refreshes on demand', async () => {
    const refetch = vi.fn();
    hook.mockReturnValue(result({ refetch }));
    render(<CustomerHealthDashboard />);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(refetch).toHaveBeenCalled();
  });
});
