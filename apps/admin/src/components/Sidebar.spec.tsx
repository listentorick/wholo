import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Permission } from '@wholo/types';
import { Sidebar } from './Sidebar';

const nav = { pathname: '/orders' };
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const ALL: string[] = Object.values(Permission);
const without = (...denied: Permission[]) => ALL.filter((p) => !denied.includes(p as Permission));
const auth = { user: { permissions: ALL } as { permissions: string[] } | null };
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => auth,
}));

const navBadges = { counts: {} as Record<string, number> };
vi.mock('@/lib/nav-badges-context', () => ({
  useNavBadges: () => navBadges,
}));

beforeEach(() => {
  nav.pathname = '/orders';
  navBadges.counts = {};
  auth.user = { permissions: ALL };
});

describe('Sidebar — hides what the user can never use', () => {
  const links = () => screen.queryAllByRole('link').map((l) => l.textContent?.replace(/\d+$/, '').trim());

  it('shows an Operations manager tax types and integrations, but not Company Settings or Team', () => {
    auth.user = { permissions: without(Permission.SETTINGS_MANAGE, Permission.ACCOUNTING_MANAGE, Permission.TEAM_MANAGE) };
    render(<Sidebar onClose={vi.fn()} onLogout={vi.fn()} />);

    expect(links()).toEqual(expect.arrayContaining(['Orders', 'Customers', 'Products', 'Price lists', 'Tax types', 'Integrations']));
    expect(links()).not.toContain('Company Settings');
    expect(links()).not.toContain('Team');
  });

  it('shows the Owner everything, including Company Settings and Team', () => {
    render(<Sidebar onClose={vi.fn()} onLogout={vi.fn()} />);
    expect(links()).toEqual(expect.arrayContaining(['Company Settings', 'Team', 'Tax types', 'Integrations']));
  });

  it('gives a narrow role a narrow menu, and drops a group heading once nothing under it is visible', () => {
    auth.user = {
      permissions: [Permission.ORDERS_READ, Permission.CUSTOMERS_READ, Permission.DELIVERY_READ, Permission.DELIVERY_MANAGE],
    };
    render(<Sidebar onClose={vi.fn()} onLogout={vi.fn()} />);

    expect(links()).toEqual(expect.arrayContaining(['Dashboard', 'Orders', 'Delivery Runs', 'Customers', 'Delivery Routes']));
    for (const hidden of ['Products', 'Catalogues', 'Price lists', 'Tax types', 'Integrations', 'Team', 'Company Settings']) {
      expect(links()).not.toContain(hidden);
    }
    expect(screen.queryByText('Catalogue & Pricing')).not.toBeInTheDocument();
    expect(screen.queryByText('System')).not.toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
  });

  it('shows only the ungated items before the user has loaded', () => {
    auth.user = null;
    render(<Sidebar onClose={vi.fn()} onLogout={vi.fn()} />);
    expect(links()).toEqual(['Dashboard']);
  });
});

describe('Sidebar — Team', () => {
  it('shows Team to someone who can manage the team', () => {
    auth.user = { permissions: ['team:manage'] };
    render(<Sidebar onClose={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.getByRole('link', { name: /team/i })).toHaveAttribute('href', '/team');
  });

  it('hides Team from everyone else, including before the user has loaded', () => {
    auth.user = { permissions: ['orders:read', 'customers:manage'] };
    const { unmount } = render(<Sidebar onClose={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /team/i })).not.toBeInTheDocument();
    unmount();

    auth.user = null;
    render(<Sidebar onClose={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /team/i })).not.toBeInTheDocument();
  });

  it('sits in the System group with Integrations', () => {
    auth.user = { permissions: ['team:manage', 'accounting:read'] };
    render(<Sidebar onClose={vi.fn()} onLogout={vi.fn()} />);
    const system = screen.getByText('System').closest('div')!.parentElement!;
    expect(system).toContainElement(screen.getByRole('link', { name: /team/i }));
    expect(system).toContainElement(screen.getByRole('link', { name: /integrations/i }));
  });
});

describe('Sidebar', () => {
  it('renders a count badge for a nav item with a positive attention count', () => {
    navBadges.counts = { '/orders': 3 };
    render(<Sidebar onClose={vi.fn()} onLogout={vi.fn()} />);

    expect(screen.getByRole('link', { name: /orders/i })).toHaveTextContent('3');
  });

  it('shows no badge when every attention count is zero', () => {
    navBadges.counts = { '/orders': 0, '/integrations': 0 };
    render(<Sidebar onClose={vi.fn()} onLogout={vi.fn()} />);

    expect(screen.getByRole('link', { name: /orders/i })).not.toHaveTextContent('0');
  });

  it('marks the link matching the current pathname as active', () => {
    nav.pathname = '/products';
    render(<Sidebar onClose={vi.fn()} onLogout={vi.fn()} />);

    expect(screen.getByRole('link', { name: /products/i }).className).toContain('text-sidebar-accent');
    expect(screen.getByRole('link', { name: /orders/i }).className).not.toContain('text-sidebar-accent');
  });

  it('calls onClose when a nav link is clicked (closes the mobile drawer)', async () => {
    const onClose = vi.fn();
    render(<Sidebar onClose={onClose} onLogout={vi.fn()} />);

    await userEvent.click(screen.getByRole('link', { name: /dashboard/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onLogout from the log out button', async () => {
    const onLogout = vi.fn();
    render(<Sidebar onClose={vi.fn()} onLogout={onLogout} />);

    await userEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(onLogout).toHaveBeenCalled();
  });
});
