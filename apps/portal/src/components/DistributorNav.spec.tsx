import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributorNav } from './DistributorNav';

const mockPush = vi.fn();
let mockCartCount = 0;

vi.mock('next/navigation', () => ({
  usePathname: () => '/winos',
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/cart-context', () => ({
  useCart: () => ({ cartCount: mockCartCount }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCartCount = 0;
});

describe('DistributorNav', () => {
  it('renders three tab labels', () => {
    render(<DistributorNav distributorSlug="winos" />);
    expect(screen.getByText('About')).toBeDefined();
    expect(screen.getByText('Shop')).toBeDefined();
    expect(screen.getByText('Orders')).toBeDefined();
    expect(screen.queryByText('Favourites')).toBeNull();
  });

  it('links to the correct hrefs', () => {
    render(<DistributorNav distributorSlug="winos" />);
    expect(screen.getByText('About').closest('a')?.getAttribute('href')).toBe('/winos');
    expect(screen.getByText('Shop').closest('a')?.getAttribute('href')).toBe('/winos/products');
    expect(screen.getByText('Orders').closest('a')?.getAttribute('href')).toBe('/winos/orders');
  });

  it('marks About as active when on the root slug path', () => {
    render(<DistributorNav distributorSlug="winos" />);
    const aboutLink = screen.getByText('About').closest('a');
    expect(aboutLink?.className).toContain('border-accent');
  });

  it('marks inactive tabs with transparent border', () => {
    render(<DistributorNav distributorSlug="winos" />);
    const shopLink = screen.getByText('Shop').closest('a');
    expect(shopLink?.className).toContain('border-transparent');
  });

  it('shows cart badge when cartCount > 0', () => {
    mockCartCount = 3;
    render(<DistributorNav distributorSlug="winos" />);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('hides cart badge when cartCount is 0', () => {
    mockCartCount = 0;
    render(<DistributorNav distributorSlug="winos" />);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('navigates to checkout when cart is clicked', () => {
    render(<DistributorNav distributorSlug="winos" />);
    fireEvent.click(screen.getByLabelText(/Cart/));
    expect(mockPush).toHaveBeenCalledWith('/winos/checkout');
  });
});
