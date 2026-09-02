import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from './Sidebar';

const nav = { pathname: '/orders' };
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const navBadges = { counts: {} as Record<string, number> };
vi.mock('@/lib/nav-badges-context', () => ({
  useNavBadges: () => navBadges,
}));

beforeEach(() => {
  nav.pathname = '/orders';
  navBadges.counts = {};
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
