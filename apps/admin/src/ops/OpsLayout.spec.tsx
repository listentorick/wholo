import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const auth = { user: { firstName: 'Test', lastName: 'Operator' } as unknown, isLoading: false };
const logout = vi.fn();
let pathname = '/ops/wholesalers';
vi.mock('@/lib/hooks/use-require-auth', () => ({ useRequireAuth: () => auth }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ logout }) }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

import { OpsLayout } from './OpsLayout';
import { clearSelection, setSelection } from './selection';

describe('OpsLayout', () => {
  afterEach(() => {
    clearSelection();
    auth.isLoading = false;
    pathname = '/ops/wholesalers';
    vi.clearAllMocks();
  });

  it('marks the current page, titles the tab, and shows the page', () => {
    render(<OpsLayout><p>Wholesalers page</p></OpsLayout>);
    expect(screen.getAllByRole('link', { name: 'Wholesalers' })[0]).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link', { name: 'Dashboard' })[0]).not.toHaveAttribute('aria-current');
    expect(document.title).toBe('Stocdup Ops · Wholesalers');
    expect(screen.getByText('Wholesalers page')).toBeInTheDocument();
    expect(screen.getByText('Stocdup operator')).toBeInTheDocument();
  });

  it('titles the dashboard as plain Stocdup Ops', () => {
    pathname = '/ops';
    render(<OpsLayout>x</OpsLayout>);
    expect(document.title).toBe('Stocdup Ops');
  });

  it('offers a way back into the wholesaler this tab has open', () => {
    setSelection({ distributorId: 'dist-1', name: 'Vine & Co', grantId: 'g-1', expiresAt: '2099-01-01T00:00:00Z', reason: 'x' });
    render(<OpsLayout>x</OpsLayout>);
    expect(screen.getByRole('link', { name: 'Return to Vine & Co' })).toHaveAttribute('href', '/');
  });

  it('has no way back when no wholesaler is open', () => {
    render(<OpsLayout>x</OpsLayout>);
    expect(screen.queryByRole('link', { name: /Return to/ })).not.toBeInTheDocument();
  });

  it('logs out', async () => {
    render(<OpsLayout>x</OpsLayout>);
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('shows only a spinner until the operator is known', () => {
    auth.isLoading = true;
    render(<OpsLayout><p>Wholesalers page</p></OpsLayout>);
    expect(screen.queryByText('Wholesalers page')).not.toBeInTheDocument();
  });
});
