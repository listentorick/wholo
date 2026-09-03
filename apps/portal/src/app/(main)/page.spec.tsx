import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HomePage from './page';
import type { PortalDistributorSummary } from '@wholo/types';

// ── Module mocks ──────────────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockAuth: {
  user: { firstName: string } | null;
  accessToken: string | null;
  isLoading: boolean;
  orderAsMode: boolean;
  orderAsDistributorId: string | null;
};
vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: () => mockAuth,
}));

// The RecommendedSuppliers child reads `accessToken` straight from the context.
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'tok' }),
}));

const mockGetMyDistributors = vi.fn();
const mockGetRecommended = vi.fn();
vi.mock('@wholo/api-client', () => ({
  portalApi: {
    getMyDistributors: (...args: unknown[]) => mockGetMyDistributors(...args),
    getRecommendedDistributors: () => mockGetRecommended(),
  },
}));

// This box runs the portal suite 33 files in parallel on WSL2; the async
// supplier-fetch effect can starve past the default 5s. Give this file headroom.
vi.setConfig({ testTimeout: 15_000 });

// ── Fixtures ─────────────────────────────────────────────────────────────────
const distributor = (
  id: string,
  name: string,
  overrides: Partial<PortalDistributorSummary> = {},
): PortalDistributorSummary => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  logoUrl: null,
  email: null,
  phone: null,
  orderCount: 0,
  minimumOrderSpend: null,
  ...overrides,
});

const manyDistributors = (n: number) =>
  Array.from({ length: n }, (_, i) => distributor(`d${i}`, `Supplier ${i}`));

beforeEach(() => {
  mockPush.mockClear();
  mockAuth = {
    user: { firstName: 'Sam' },
    accessToken: 'tok',
    isLoading: false,
    orderAsMode: false,
    orderAsDistributorId: null,
  };
  mockGetMyDistributors.mockResolvedValue([
    distributor('d1', 'Mere Wine Co', { orderCount: 3 }),
    distributor('d2', 'Goo Cheese', { orderCount: 12 }),
  ]);
  mockGetRecommended.mockResolvedValue([]);
});

describe('HomePage — layout', () => {
  it('greets the signed-in user', async () => {
    render(<HomePage />);
    expect(await screen.findByRole('heading', { name: /Hi, Sam/ })).toBeInTheDocument();
  });

  it('shows the account eyebrow and the suppliers section header', async () => {
    render(<HomePage />);
    // Both kickers render immediately — they are not behind the supplier fetch.
    expect(await screen.findByText('Your account')).toBeInTheDocument();
    expect(screen.getByText('Your suppliers')).toBeInTheDocument();
  });

  it('renders full-width — no centred reading-column cap', async () => {
    const { container } = render(<HomePage />);
    await screen.findByText('Mere Wine Co');
    expect(container.querySelector('.max-w-3xl')).toBeNull();
    expect(container.querySelector('.flex-1')).not.toBeNull();
  });

  it('renders suppliers as a vertical stack, not a grid', async () => {
    render(<HomePage />);
    const name = await screen.findByText('Mere Wine Co');
    expect(screen.getByText('Goo Cheese')).toBeInTheDocument();
    const listEl = name.closest('ul');
    expect(listEl).not.toBeNull();
    expect(listEl!.className).toContain('flex-col');
    expect(listEl!.className).not.toContain('grid-cols');
  });
});

describe('HomePage — suppliers', () => {
  it('renders one row per supplier with its order count', async () => {
    render(<HomePage />);
    await screen.findByText('Mere Wine Co');
    expect(screen.getByText('Goo Cheese')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getAllByText('orders').length).toBe(2);
  });

  it('navigates to the distributor when a supplier row is clicked', async () => {
    render(<HomePage />);
    fireEvent.click(await screen.findByRole('button', { name: /Mere Wine Co/ }));
    expect(mockPush).toHaveBeenCalledWith('/mere-wine-co');
  });

  it('locks non-selected suppliers in order-as mode', async () => {
    mockAuth.orderAsMode = true;
    mockAuth.orderAsDistributorId = 'd1';
    render(<HomePage />);
    await screen.findByText('Goo Cheese');
    expect(screen.queryByRole('button', { name: /Goo Cheese/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Mere Wine Co/ })).toBeInTheDocument();
  });

  it('shows the empty state when the customer has no suppliers', async () => {
    mockGetMyDistributors.mockResolvedValue([]);
    render(<HomePage />);
    expect(await screen.findByText('No suppliers yet')).toBeInTheDocument();
  });

  it('shows the dashed empty slot only for 1–3 suppliers', async () => {
    render(<HomePage />);
    expect(await screen.findByText(/Your other suppliers appear here/)).toBeInTheDocument();
  });

  it('hides the empty slot once the customer has more than three suppliers', async () => {
    mockGetMyDistributors.mockResolvedValue(manyDistributors(5));
    render(<HomePage />);
    await screen.findByText('Supplier 0');
    expect(screen.queryByText(/Your other suppliers appear here/)).toBeNull();
  });

  it('hides the empty slot when there are no suppliers at all', async () => {
    mockGetMyDistributors.mockResolvedValue([]);
    render(<HomePage />);
    await screen.findByText('No suppliers yet');
    expect(screen.queryByText(/Your other suppliers appear here/)).toBeNull();
  });

  it('offers the secondary name filter only above the threshold', async () => {
    mockGetMyDistributors.mockResolvedValue(manyDistributors(8));
    render(<HomePage />);
    expect(await screen.findByPlaceholderText('Filter your suppliers…')).toBeInTheDocument();
  });

  it('does not show the secondary filter for a short list', async () => {
    render(<HomePage />);
    await screen.findByText('Mere Wine Co');
    expect(screen.queryByPlaceholderText('Filter your suppliers…')).toBeNull();
  });
});

describe('HomePage — discovery placeholders', () => {
  it('renders the recommended-suppliers section', async () => {
    render(<HomePage />);
    expect(await screen.findByText('Recommended suppliers')).toBeInTheDocument();
    expect(screen.getByText('Marketplace')).toBeInTheDocument();
  });

  it('renders the search bar as an inert placeholder', async () => {
    render(<HomePage />);
    expect(await screen.findByText('Search products or suppliers')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders the merchandising band', async () => {
    render(<HomePage />);
    expect(await screen.findByText('Seasonal ranges & new arrivals')).toBeInTheDocument();
  });

  it('renders the Find new suppliers card, non-interactive', async () => {
    render(<HomePage />);
    await waitFor(() =>
      expect(screen.getByText('Find new suppliers')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Find new suppliers/ })).toBeNull();
  });
});
