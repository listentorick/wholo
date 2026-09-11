import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

let mockAuth: { authError: string | null; logout: () => void };
let mockPathname: string;

vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

vi.mock('@/lib/cart-context', () => ({
  CartProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockAuth }));
vi.mock('@/lib/distributor-context', () => ({
  DistributorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDistributor: () => ({ distributor: { name: 'Fine Wines Co' } }),
}));
vi.mock('@/lib/storefront-search', () => ({
  StorefrontSearchProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
vi.mock('@/components/portal/ScrollReset', () => ({ ScrollReset: () => <div data-testid="scroll-reset" /> }));
vi.mock('@/components/storefront/StorefrontChrome', () => ({
  StorefrontChrome: ({ mode }: { mode: string }) => <div data-testid="chrome">{mode}</div>,
}));

import { DistributorShell } from './DistributorShell';

const slug = 'fine-wines-co';
const initialDistributor = { id: 'd1', slug, name: 'Fine Wines Co' } as any;

function renderShell(pathname = `/${slug}`) {
  mockPathname = pathname;
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

  it('renders the persistent chrome (top bar, platform strip, order-as, footer) + children', () => {
    renderShell();
    expect(screen.getByTestId('top-bar')).toHaveTextContent('distributor');
    expect(screen.getByTestId('nav-strip')).toHaveTextContent('Fine Wines Co');
    expect(screen.getByTestId('order-as-banner')).toBeInTheDocument();
    expect(screen.getByTestId('order-as-handler')).toBeInTheDocument();
    expect(screen.getByTestId('scroll-reset')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('renders the storefront chrome in spy mode on the storefront route', () => {
    renderShell(`/${slug}`);
    expect(screen.getByTestId('chrome')).toHaveTextContent('spy');
  });

  it('renders the storefront chrome in link mode on a product-detail route', () => {
    renderShell(`/${slug}/products/prod-1`);
    expect(screen.getByTestId('chrome')).toHaveTextContent('link');
  });

  it('renders the storefront chrome in link mode on orders routes', () => {
    for (const path of [`/${slug}/orders`, `/${slug}/orders/o1`]) {
      const { unmount } = renderShell(path);
      expect(screen.getByTestId('chrome')).toHaveTextContent('link');
      unmount();
    }
  });

  it('does NOT render the storefront chrome on checkout or the bare products redirect', () => {
    for (const path of [`/${slug}/checkout`, `/${slug}/products`]) {
      const { unmount } = renderShell(path);
      expect(screen.queryByTestId('chrome')).toBeNull();
      unmount();
    }
  });

  it('shows the sign-in error screen when authError is set', () => {
    mockAuth = { authError: 'no matching user', logout: vi.fn() };
    renderShell();
    expect(screen.getByText("We couldn't sign you in")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByText('content')).toBeNull();
  });
});
