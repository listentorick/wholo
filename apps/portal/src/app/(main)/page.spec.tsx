import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HomePage from './page';
import type { PortalDistributorSummary } from '@wholo/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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

const mockGetMyDistributors = vi.fn();
vi.mock('@wholo/api-client', () => ({
  portalApi: { getMyDistributors: (...args: unknown[]) => mockGetMyDistributors(...args) },
}));

const distributor = (id: string, name: string): PortalDistributorSummary => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  logoUrl: null,
  email: null,
  phone: null,
  orderCount: 0,
  minimumOrderSpend: null,
});

beforeEach(() => {
  mockAuth = {
    user: { firstName: 'Sam' },
    accessToken: 'tok',
    isLoading: false,
    orderAsMode: false,
    orderAsDistributorId: null,
  };
  mockGetMyDistributors.mockResolvedValue([distributor('d1', 'Mere Wine Co'), distributor('d2', 'Goo Cheese')]);
});

describe('HomePage — layout', () => {
  it('greets the signed-in user', async () => {
    render(<HomePage />);
    expect(await screen.findByRole('heading', { name: /Hi, Sam/ })).toBeInTheDocument();
  });

  it('renders full-width — no centred reading-column cap', async () => {
    const { container } = render(<HomePage />);
    await screen.findByText('Mere Wine Co');
    expect(container.querySelector('.max-w-3xl')).toBeNull();
    // PageShell's flex-fill wrapper is still present (fills the space beside the sidebar).
    expect(container.querySelector('.flex-1')).not.toBeNull();
  });

  it('lays the supplier grid out across breakpoint columns like the other full-width pages', async () => {
    render(<HomePage />);
    const card = await screen.findByText('Mere Wine Co');
    const grid = card.closest('.grid') as HTMLElement;
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('xl:grid-cols-3');
  });

  it('shows the empty state when the customer has no suppliers', async () => {
    mockGetMyDistributors.mockResolvedValue([]);
    render(<HomePage />);
    await waitFor(() => expect(screen.getByText('No suppliers yet')).toBeInTheDocument());
  });
});
