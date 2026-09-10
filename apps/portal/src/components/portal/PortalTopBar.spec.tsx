import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPush = vi.fn();
let mockParams: Record<string, string> = {};
let mockUser: { organisationName?: string } | null = { organisationName: 'The Roebuck Inn' };
let mockCart: { cartCount: number } | null = null;

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock('@/lib/cart-context', () => ({ useCartSafe: () => mockCart }));
vi.mock('@/components/UserMenuButton', () => ({ UserMenuButton: () => <div data-testid="user-menu" /> }));

import { PortalTopBar } from './PortalTopBar';

beforeEach(() => {
  vi.clearAllMocks();
  mockParams = {};
  mockUser = { organisationName: 'The Roebuck Inn' };
  mockCart = null;
});

describe('PortalTopBar', () => {
  it('renders the wordmark as a link to home', () => {
    render(<PortalTopBar variant="account" />);
    expect(screen.getByLabelText('Stocdup home')).toHaveAttribute('href', '/');
  });

  it('renders the platform search as an inert placeholder, not a real field', () => {
    render(<PortalTopBar variant="account" />);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows the acting organisation name', () => {
    render(<PortalTopBar variant="account" />);
    expect(screen.getByText('The Roebuck Inn')).toBeInTheDocument();
  });

  it('is sticky in the account variant, static in the distributor variant', () => {
    const { container, rerender } = render(<PortalTopBar variant="account" />);
    expect(container.querySelector('header')?.className).toContain('sticky');
    rerender(<PortalTopBar variant="distributor" />);
    expect(container.querySelector('header')?.className).not.toContain('sticky');
  });

  it('hides the basket when there is no cart context (account area)', () => {
    mockParams = {};
    mockCart = null;
    render(<PortalTopBar variant="account" />);
    expect(screen.queryByLabelText(/Basket/)).toBeNull();
  });

  it('shows the basket and its count inside a distributor context', () => {
    mockParams = { distributorSlug: 'winos' };
    mockCart = { cartCount: 3 };
    render(<PortalTopBar variant="distributor" />);
    const basket = screen.getByLabelText('Basket, 3 items');
    expect(basket).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.click(basket);
    expect(mockPush).toHaveBeenCalledWith('/winos/checkout');
  });

  it('shows the basket with no badge at count 0', () => {
    mockParams = { distributorSlug: 'winos' };
    mockCart = { cartCount: 0 };
    render(<PortalTopBar variant="distributor" />);
    expect(screen.getByLabelText('Basket, 0 items')).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });
});
