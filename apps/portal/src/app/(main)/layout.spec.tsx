import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockAuth: { authError: string | null; logout: () => void };

vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockAuth }));
vi.mock('@/components/portal/PortalTopBar', () => ({
  PortalTopBar: ({ variant }: { variant: string }) => <div data-testid="top-bar">{variant}</div>,
}));
vi.mock('@/components/portal/PortalFooter', () => ({ PortalFooter: () => <div data-testid="footer" /> }));
vi.mock('@/components/OrderAsBanner', () => ({ OrderAsBanner: () => <div data-testid="order-as-banner" /> }));

import MainLayout from './layout';

beforeEach(() => {
  mockAuth = { authError: null, logout: vi.fn() };
});

describe('MainLayout', () => {
  it('renders the account top bar, footer, order-as banner and children', () => {
    render(<MainLayout><p>child</p></MainLayout>);
    expect(screen.getByTestId('top-bar')).toHaveTextContent('account');
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByTestId('order-as-banner')).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('does not render a navigation sidebar', () => {
    const { container } = render(<MainLayout><p>child</p></MainLayout>);
    expect(container.querySelector('aside')).toBeNull();
  });

  it('shows the sign-in error screen when authError is set', () => {
    mockAuth = { authError: 'no matching user', logout: vi.fn() };
    render(<MainLayout><p>child</p></MainLayout>);
    expect(screen.getByText("We couldn't sign you in")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByText('child')).toBeNull();
  });
});
