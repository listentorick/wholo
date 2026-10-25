import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlatformDistributor, PlatformStats } from '@wholo/types';

const stats = vi.fn();
const distributors = vi.fn();
const myGrants = vi.fn();
vi.mock('./api', () => ({ opsApi: { stats: () => stats(), distributors: () => distributors(), myGrants: () => myGrants() } }));
vi.mock('./navigation', () => ({ enterWholesaler: vi.fn() }));
// ECharts is covered by OrdersPerDayChart.spec; here only that the chart is given the stats.
vi.mock('./OrdersPerDayChart', () => ({ OrdersPerDayChart: () => <div data-testid="orders-chart" /> }));

import { OpsHome } from './OpsHome';
import { supportGrant } from './fixtures';
import { clearSelection, dismissEndedVisit, endSelection, getEndedVisit, setSelection } from './selection';

const platform: PlatformStats = {
  activeWholesalers: 1204,
  wholesalersJoinedLast30Days: 6,
  activeTradeCustomers: 380,
  ordersLast30Days: 120,
  ordersPrevious30Days: 100,
  openSupportGrants: 2,
  wholesalersWithOpenSupport: 2,
  ordersPerDay: [],
};

const wholesaler = (overrides: Partial<PlatformDistributor>): PlatformDistributor => ({
  id: 'dist-3',
  name: 'Rogers Bakery',
  slug: null,
  ownerEmail: null,
  createdAt: '2026-10-20T10:00:00Z',
  activeCustomers: 0,
  products: 0,
  ordersLast30Days: 0,
  lastOrderAt: null,
  attention: ['NEW_WITHOUT_PRODUCTS'],
  myActiveGrant: null,
  ...overrides,
});

describe('OpsHome', () => {
  afterEach(() => {
    clearSelection();
    dismissEndedVisit();
    vi.clearAllMocks();
  });

  it('shows the platform figures, the wholesalers to look at, and the operator’s open access', async () => {
    stats.mockResolvedValue(platform);
    distributors.mockResolvedValue([wholesaler({})]);
    myGrants.mockResolvedValue([supportGrant(), supportGrant({ id: 'g-old', status: 'EXPIRED', distributorName: 'Goo Cheese' })]);
    render(<OpsHome />);

    expect(await screen.findByText('1,204')).toBeInTheDocument();
    expect(screen.getByText('6 joined in 30 days')).toBeInTheDocument();
    expect(screen.getByText('▲ 20% vs. previous 30 days')).toBeInTheDocument();
    expect(screen.getByTestId('orders-chart')).toBeInTheDocument();
    expect(screen.getByText('Rogers Bakery')).toBeInTheDocument();
    expect(screen.getByText('New, no products yet')).toBeInTheDocument();
    expect(screen.getByText('You have access to Vine & Co')).toBeInTheDocument();
    expect(screen.queryByText('You have access to Goo Cheese')).not.toBeInTheDocument();
  });

  it('says when nothing needs a look', async () => {
    stats.mockResolvedValue(platform);
    distributors.mockResolvedValue([]);
    myGrants.mockResolvedValue([]);
    render(<OpsHome />);
    expect(await screen.findByText('Nothing needs a look right now.')).toBeInTheDocument();
  });

  it('says why the last wholesaler was left, until dismissed', async () => {
    stats.mockResolvedValue(platform);
    distributors.mockResolvedValue([]);
    myGrants.mockResolvedValue([]);
    setSelection({ distributorId: 'dist-1', name: 'Vine & Co', grantId: 'g-1', expiresAt: '2026-10-23T14:00:00Z', reason: 'x' });
    endSelection('EXPIRED');
    render(<OpsHome />);

    expect(screen.getByRole('status')).toHaveTextContent('Your access to Vine & Co has ended — time ran out');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(getEndedVisit()).toBeNull();
  });

  it('says so when the dashboard cannot be loaded', async () => {
    stats.mockRejectedValue(new Error('network'));
    distributors.mockResolvedValue([]);
    myGrants.mockResolvedValue([]);
    render(<OpsHome />);
    expect(await screen.findByText('Couldn’t load the platform dashboard. Please refresh.')).toBeInTheDocument();
  });
});
