import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from './page';

const push = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(search),
}));

const authState: { user: unknown } = { user: null };
vi.mock('@/lib/auth-context', () => ({ useAuth: () => authState }));

// The dashboards themselves are tested on their own; this is about who sees which, and
// what the shell hands them. Each real dashboard draws the tab strip from the `nav` it is
// given, so the mocks do the same, with the real bar.
vi.mock('@/components/dashboard/SalesDashboard', async () => {
  const { DashboardBar } = await import('@/components/dashboard/DashboardBar');
  return { SalesDashboard: ({ nav }: { nav?: never }) => <div><DashboardBar nav={nav} />the sales dashboard</div> };
});
vi.mock('@/components/dashboard/customer-health/CustomerHealthDashboard', async () => {
  const { DashboardBar } = await import('@/components/dashboard/DashboardBar');
  return { CustomerHealthDashboard: ({ nav }: { nav?: never }) => <div><DashboardBar nav={nav} />the customers dashboard</div> };
});
vi.mock('@/components/dashboard/delivery/DeliveryDashboard', async () => {
  const { DashboardBar } = await import('@/components/dashboard/DashboardBar');
  return { DeliveryDashboard: ({ nav }: { nav?: never }) => <div><DashboardBar nav={nav} />the delivery dashboard</div> };
});

const WAREHOUSE = ['orders:read', 'orders:manage', 'delivery:read', 'delivery:manage', 'customers:read'];
const OWNER = [...WAREHOUSE, 'analytics:read', 'settings:manage'];

const signIn = (permissions: string[]) => {
  authState.user = { firstName: 'Ada', lastName: 'Acme', organisationName: 'Acme Wines', permissions };
};

describe('DashboardPage', () => {
  beforeEach(() => {
    push.mockReset();
    search = '';
    signIn(OWNER);
  });

  it('has no greeting: the top bar already says who and where you are', () => {
    render(<DashboardPage />);
    expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Acme Wines')).not.toBeInTheDocument();
  });

  it('shows nothing until the signed-in user is known', () => {
    authState.user = null;
    const { container } = render(<DashboardPage />);
    expect(container).toBeEmptyDOMElement();
  });

  describe('Owner / Operations manager (orders, deliveries and analytics)', () => {
    it('offers Delivery, Customers and Sales in that order, opening on Delivery', () => {
      render(<DashboardPage />);

      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Delivery', 'Customers', 'Sales']);
      expect(screen.getByText('the delivery dashboard')).toBeInTheDocument();
      expect(screen.queryByText('the sales dashboard')).not.toBeInTheDocument();
    });

    it('opens the Sales dashboard from the tab', async () => {
      render(<DashboardPage />);

      await userEvent.click(screen.getByRole('button', { name: 'Sales' }));

      expect(push).toHaveBeenCalledWith('/?tab=sales');
    });

    it('opens the Customers dashboard from the tab', async () => {
      render(<DashboardPage />);

      await userEvent.click(screen.getByRole('button', { name: 'Customers' }));

      expect(push).toHaveBeenCalledWith('/?tab=customers');
    });

    it('shows Customers when the address says so', () => {
      search = 'tab=customers';
      render(<DashboardPage />);

      expect(screen.getByText('the customers dashboard')).toBeInTheDocument();
      expect(screen.queryByText('the delivery dashboard')).not.toBeInTheDocument();
    });

    it('shows Sales when the address says so', () => {
      search = 'tab=sales';
      render(<DashboardPage />);

      expect(screen.getByText('the sales dashboard')).toBeInTheDocument();
      expect(screen.queryByText('the delivery dashboard')).not.toBeInTheDocument();
    });
  });

  describe('Warehouse staff (orders and deliveries, no analytics)', () => {
    beforeEach(() => signIn(WAREHOUSE));

    it('sees Delivery, with no tab strip to choose from', () => {
      render(<DashboardPage />);

      expect(screen.getByText('the delivery dashboard')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sales' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delivery' })).not.toBeInTheDocument();
    });

    it('never reaches Sales or Customers, even by editing the address', () => {
      for (const tab of ['sales', 'customers']) {
        search = `tab=${tab}`;
        const { unmount } = render(<DashboardPage />);

        expect(screen.getByText('the delivery dashboard')).toBeInTheDocument();
        expect(screen.queryByText('the sales dashboard')).not.toBeInTheDocument();
        expect(screen.queryByText('the customers dashboard')).not.toBeInTheDocument();
        unmount();
      }
    });
  });

  it('shows Customers and Sales, opening on Customers, to someone who can see analytics but not deliveries', () => {
    signIn(['analytics:read']);
    render(<DashboardPage />);

    expect(screen.getByText('the customers dashboard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sales' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delivery' })).not.toBeInTheDocument();
  });

  it('needs both orders and deliveries to show Delivery: one alone is not enough', () => {
    signIn(['delivery:read']);
    render(<DashboardPage />);

    expect(screen.queryByText('the delivery dashboard')).not.toBeInTheDocument();
    expect(screen.getByText(/nothing to show here for your role/i)).toBeInTheDocument();
  });

  it('says so plainly, rather than failing to load, when the role has no dashboard', () => {
    signIn([]);
    render(<DashboardPage />);

    expect(screen.getByText(/nothing to show here for your role/i)).toBeInTheDocument();
    expect(screen.queryByText('the delivery dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('the sales dashboard')).not.toBeInTheDocument();
  });
});
