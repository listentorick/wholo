import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributorHeader } from './DistributorHeader';

const mockPush = vi.fn();
let mockCartCount = 0;
let mockDistributor: { name: string; logoUrl: string | null } | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, onClick, className }: { href: string; children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <a href={href} onClick={onClick} className={className}>{children}</a>
  ),
}));

vi.mock('@/lib/cart-context', () => ({
  useCart: () => ({ cartCount: mockCartCount }),
}));

vi.mock('@/lib/distributor-context', () => ({
  useDistributor: () => ({ distributor: mockDistributor }),
}));

const slug = 'test-distributor';

function renderHeader() {
  return render(<DistributorHeader distributorSlug={slug} />);
}

describe('DistributorHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCartCount = 0;
    mockDistributor = null;
  });

  it('shows distributor name', () => {
    mockDistributor = { name: 'Fine Wines Ltd', logoUrl: null };
    renderHeader();
    expect(screen.getByText('Fine Wines Ltd')).toBeTruthy();
  });

  it('falls back to slug when distributor not loaded', () => {
    mockDistributor = null;
    renderHeader();
    expect(screen.getByText(slug)).toBeTruthy();
  });

  it('shows cart badge when cartCount > 0', () => {
    mockCartCount = 5;
    renderHeader();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('hides cart badge when cartCount is 0', () => {
    mockCartCount = 0;
    renderHeader();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('navigates to checkout when cart is clicked', () => {
    mockCartCount = 2;
    renderHeader();
    fireEvent.click(screen.getByLabelText(/cart/i));
    expect(mockPush).toHaveBeenCalledWith(`/${slug}/checkout`);
  });

  it('renders distributor logo when logoUrl is provided', () => {
    mockDistributor = { name: 'Winos', logoUrl: 'https://example.com/logo.png' };
    const { container } = renderHeader();
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/logo.png');
  });
});
