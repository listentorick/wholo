import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

let mockAuth: { authError: string | null; logout: () => void };

vi.mock('@/lib/cart-context', () => ({
  CartProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockAuth }));

vi.mock('@/lib/distributor-context', () => ({
  DistributorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDistributor: () => ({ distributor: { name: 'Fine Wines Co' } }),
}));

vi.mock('@/components/portal/PortalTopBar', () => ({
  PortalTopBar: ({ variant }: { variant: string }) => <div data-testid="top-bar">{variant}</div>,
}));
vi.mock('@/components/portal/PlatformNavStrip', () => ({
  PlatformNavStrip: ({ distributorName }: { distributorName?: string }) => (
    <div data-testid="nav-strip">{distributorName}</div>
  ),
}));
vi.mock('@/components/portal/PortalFooter', () => ({ PortalFooter: () => <div data-testid="footer" /> }));
vi.mock('@/components/OrderAsBanner', () => ({ OrderAsBanner: () => <div data-testid="order-as-banner" /> }));
vi.mock('@/components/OrderAsHandler', () => ({ OrderAsHandler: () => <div data-testid="order-as-handler" /> }));

import { DistributorShell } from './DistributorShell';

const slug = 'fine-wines-co';
const initialDistributor = { id: 'd1', slug, name: 'Fine Wines Co' } as any;

function renderShell() {
  return render(
    <DistributorShell distributorSlug={slug} initialDistributor={initialDistributor}>
      <div>content</div>
    </DistributorShell>,
  );
}

describe('DistributorShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = { authError: null, logout: vi.fn() };
  });

  it('renders the distributor-variant top bar, platform strip, order-as chrome, footer and children', () => {
    renderShell();
    expect(screen.getByTestId('top-bar')).toHaveTextContent('distributor');
    expect(screen.getByTestId('nav-strip')).toHaveTextContent('Fine Wines Co');
    expect(screen.getByTestId('order-as-banner')).toBeInTheDocument();
    expect(screen.getByTestId('order-as-handler')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('does not render any of the removed chrome components', () => {
    renderShell();
    expect(screen.queryByTestId('nav-sidebar')).toBeNull();
    expect(screen.queryByTestId('distributor-header')).toBeNull();
    expect(screen.queryByTestId('distributor-nav')).toBeNull();
    expect(screen.queryByTestId('branding-banner')).toBeNull();
    expect(screen.queryByTestId('page-header')).toBeNull();
  });

  it('shows the sign-in error screen when authError is set', () => {
    mockAuth = { authError: 'no matching user', logout: vi.fn() };
    renderShell();
    expect(screen.getByText("We couldn't sign you in")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByText('content')).toBeNull();
  });
});
