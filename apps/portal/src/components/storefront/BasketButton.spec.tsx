import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPush = vi.fn();
let mockParams: Record<string, string> = {};
let mockCart: { cartCount: number } | null = null;

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/cart-context', () => ({ useCartSafe: () => mockCart }));

import { BasketButton } from './BasketButton';

beforeEach(() => {
  vi.clearAllMocks();
  mockParams = {};
  mockCart = null;
});

describe('BasketButton', () => {
  it('renders nothing outside a distributor context (no cart, no slug)', () => {
    const { container } = render(<BasketButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is a slug but no cart context', () => {
    mockParams = { distributorSlug: 'winos' };
    mockCart = null;
    const { container } = render(<BasketButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the basket and its count inside a distributor context', () => {
    mockParams = { distributorSlug: 'winos' };
    mockCart = { cartCount: 3 };
    render(<BasketButton />);
    const basket = screen.getByLabelText('Basket, 3 items');
    expect(basket).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.click(basket);
    expect(mockPush).toHaveBeenCalledWith('/winos/checkout');
  });

  it('shows the basket with no badge at count 0', () => {
    mockParams = { distributorSlug: 'winos' };
    mockCart = { cartCount: 0 };
    render(<BasketButton />);
    expect(screen.getByLabelText('Basket, 0 items')).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });
});
