import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NavigationSidebar } from './NavigationSidebar';

const mockLogout = vi.fn();
const mockPush = vi.fn();
let mockPathname = '/test-distributor';
let mockCartCount = 0;
let mockDistributor: { name: string; logoUrl: string | null } | null = null;

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

vi.mock('@/lib/cart-context', () => ({
  useCartSafe: () => ({ cartCount: mockCartCount }),
}));

vi.mock('@/lib/distributor-context', () => ({
  useDistributor: () => ({ distributor: mockDistributor }),
}));

const slug = 'test-distributor';

function renderSidebar(props?: { distributorSlug?: string }) {
  return render(<NavigationSidebar distributorSlug={props?.distributorSlug ?? slug} />);
}

describe('NavigationSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockPathname = `/${slug}`;
    mockCartCount = 0;
    mockDistributor = null;
    document.body.style.overflow = '';
  });

  it('renders Our Suppliers nav item', () => {
    renderSidebar();
    expect(screen.getByText('Our Suppliers')).toBeTruthy();
  });

  it('renders Delivery Settings when distributorSlug is provided', () => {
    renderSidebar();
    expect(screen.getByText('Delivery Settings')).toBeTruthy();
  });

  it('does not render Delivery Settings when no distributorSlug', () => {
    render(<NavigationSidebar />);
    expect(screen.queryByText('Delivery Settings')).toBeNull();
  });

  it('does not render Orders nav item', () => {
    renderSidebar();
    expect(screen.queryByText('Orders')).toBeNull();
  });

  it('renders account nav items', () => {
    renderSidebar();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('renders sign out button', () => {
    renderSidebar();
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  it('Our Suppliers link always points to /', () => {
    renderSidebar();
    const link = screen.getByText('Our Suppliers').closest('a');
    expect(link?.getAttribute('href')).toBe('/');
  });

  it('applies active styling to Our Suppliers when at /', () => {
    mockPathname = '/';
    render(<NavigationSidebar />);
    const suppliersLink = screen.getByText('Our Suppliers').closest('a');
    expect(suppliersLink?.className).toContain('bg-[#FDF0E8]');
    expect(suppliersLink?.className).toContain('border-[#D97036]');
  });

  it('does not mark Our Suppliers active on sub-pages', () => {
    mockPathname = `/${slug}/delivery-settings`;
    renderSidebar();
    const suppliersLink = screen.getByText('Our Suppliers').closest('a');
    expect(suppliersLink?.className).not.toContain('bg-[#FDF0E8]');
  });

  it('calls logout when Sign out is clicked', () => {
    renderSidebar();
    fireEvent.click(screen.getByText('Sign out'));
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it('shows cart count badge when cartCount > 0', () => {
    mockCartCount = 3;
    renderSidebar();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('hides cart badge when cartCount is 0', () => {
    mockCartCount = 0;
    renderSidebar();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('hides cart button when no distributorSlug', () => {
    mockCartCount = 5;
    render(<NavigationSidebar />);
    expect(screen.queryByLabelText(/Cart/)).toBeNull();
  });

  it('opens mobile sidebar when burger is clicked', () => {
    renderSidebar();
    fireEvent.click(screen.getByLabelText('Open navigation'));
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('closes mobile sidebar when close button is clicked', () => {
    renderSidebar();
    fireEvent.click(screen.getByLabelText('Open navigation'));
    fireEvent.click(screen.getByLabelText('Close navigation'));
    expect(document.body.style.overflow).toBe('');
  });

  it('shows Wholo wordmark in sidebar', () => {
    renderSidebar();
    expect(screen.getAllByText('Wholo').length).toBeGreaterThanOrEqual(1);
  });

  it('shows distributor name in mobile top bar', () => {
    mockDistributor = { name: 'Fine Wines Ltd', logoUrl: null };
    renderSidebar();
    expect(screen.getByText('Fine Wines Ltd')).toBeTruthy();
  });

  it('shows Wholo in mobile top bar when no distributor context', () => {
    mockDistributor = null;
    render(<NavigationSidebar />);
    const topBars = screen.getAllByText('Wholo');
    expect(topBars.length).toBeGreaterThanOrEqual(1);
  });

  it('shows contextName in mobile top bar when no distributor', () => {
    mockDistributor = null;
    render(<NavigationSidebar contextName="The Grand Hotel" />);
    expect(screen.getByText('The Grand Hotel')).toBeTruthy();
  });

  it('renders collapse button in header (desktop X)', () => {
    renderSidebar();
    expect(screen.getByLabelText('Collapse navigation')).toBeTruthy();
  });

  it('clicking desktop X shows expand button', () => {
    renderSidebar();
    fireEvent.click(screen.getByLabelText('Collapse navigation'));
    expect(screen.getByLabelText('Expand navigation')).toBeTruthy();
  });

  it('clicking expand button shows collapse button again', () => {
    renderSidebar();
    fireEvent.click(screen.getByLabelText('Collapse navigation'));
    fireEvent.click(screen.getByLabelText('Expand navigation'));
    expect(screen.getByLabelText('Collapse navigation')).toBeTruthy();
  });

  it('persists collapsed state to localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderSidebar();
    fireEvent.click(screen.getByLabelText('Collapse navigation'));
    expect(setItem).toHaveBeenCalledWith('nav-collapsed', 'true');
  });
});
