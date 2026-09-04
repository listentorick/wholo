import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DistributorShell } from './DistributorShell';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

vi.mock('@/lib/cart-context', () => ({
  CartProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ authError: null, logout: vi.fn() }),
}));

vi.mock('@/lib/distributor-context', () => ({
  DistributorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDistributor: () => ({ distributor: null, setBannerScrolledPast: vi.fn() }),
}));

vi.mock('@/components/NavigationSidebar', () => ({
  NavigationSidebar: () => <div data-testid="nav-sidebar" />,
}));

vi.mock('@/components/DistributorHeader', () => ({
  DistributorHeader: () => <div data-testid="distributor-header" />,
}));

vi.mock('@/components/OrderAsBanner', () => ({
  OrderAsBanner: () => null,
}));

vi.mock('@/components/OrderAsHandler', () => ({
  OrderAsHandler: () => null,
}));

vi.mock('@/components/DistributorNav', () => ({
  DistributorNav: () => <div data-testid="distributor-nav" />,
}));

vi.mock('@/components/BrandingBanner', () => ({
  BrandingBanner: () => <div data-testid="branding-banner" />,
}));

vi.mock('@/components/DistributorPageHeader', () => ({
  DistributorPageHeader: () => <div data-testid="page-header" />,
}));

import { usePathname } from 'next/navigation';

const slug = 'fine-wines-co';
const initialDistributor = { id: 'd1', slug, name: 'Fine Wines Co' } as any;

function renderAt(pathname: string) {
  vi.mocked(usePathname).mockReturnValue(pathname);
  return render(
    <DistributorShell distributorSlug={slug} initialDistributor={initialDistributor}>
      <div>content</div>
    </DistributorShell>,
  );
}

describe('DistributorShell — page header visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders DistributorPageHeader on the products page', () => {
    renderAt(`/${slug}/products`);
    expect(screen.getByTestId('page-header')).toBeTruthy();
    expect(screen.queryByTestId('branding-banner')).toBeNull();
  });

  it('renders BrandingBanner (not the page header) on the about page', () => {
    renderAt(`/${slug}`);
    expect(screen.getByTestId('branding-banner')).toBeTruthy();
    expect(screen.queryByTestId('page-header')).toBeNull();
  });

  it('renders neither BrandingBanner nor DistributorPageHeader on the order detail page', () => {
    renderAt(`/${slug}/orders/order-123`);
    expect(screen.queryByTestId('page-header')).toBeNull();
    expect(screen.queryByTestId('branding-banner')).toBeNull();
  });

  it('renders neither BrandingBanner nor DistributorPageHeader on the orders list page', () => {
    renderAt(`/${slug}/orders`);
    expect(screen.queryByTestId('page-header')).toBeNull();
    expect(screen.queryByTestId('branding-banner')).toBeNull();
  });

  it('renders neither BrandingBanner nor DistributorPageHeader on the checkout page (the order-summary rail carries that context)', () => {
    renderAt(`/${slug}/checkout`);
    expect(screen.queryByTestId('page-header')).toBeNull();
    expect(screen.queryByTestId('branding-banner')).toBeNull();
  });
});
