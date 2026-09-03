import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecommendedSuppliers } from './RecommendedSuppliers';
import type { PortalRecommendedDistributor } from '@wholo/types';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'tok' }),
}));

const mockGetRecommended = vi.fn();
vi.mock('@wholo/api-client', () => ({
  portalApi: { getRecommendedDistributors: () => mockGetRecommended() },
}));

const rec = (
  id: string,
  name: string,
  over: Partial<PortalRecommendedDistributor> = {},
): PortalRecommendedDistributor => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  logoUrl: null,
  tagline: null,
  location: null,
  ...over,
});

beforeEach(() => {
  mockPush.mockClear();
  mockGetRecommended.mockReset();
});

describe('RecommendedSuppliers', () => {
  it('renders the header while the feed loads, without any supplier or invite copy', () => {
    mockGetRecommended.mockReturnValue(new Promise(() => {})); // never resolves
    render(<RecommendedSuppliers />);
    expect(screen.getByText('Recommended suppliers')).toBeInTheDocument();
    expect(screen.getByText('Marketplace')).toBeInTheDocument();
    expect(screen.queryByText(/Ask them to join/)).toBeNull();
  });

  it('renders a card per recommended distributor', async () => {
    mockGetRecommended.mockResolvedValue([
      rec('d1', 'Aaa Wines'),
      rec('d2', 'Bee Bakery', { location: 'Leeds, UK', tagline: 'Sourdough since 2011' }),
    ]);
    render(<RecommendedSuppliers />);
    expect(await screen.findByText('Aaa Wines')).toBeInTheDocument();
    expect(screen.getByText('Bee Bakery')).toBeInTheDocument();
    expect(screen.getByText('Leeds, UK')).toBeInTheDocument();
    expect(screen.getByText('Sourdough since 2011')).toBeInTheDocument();
  });

  it('navigates to the distributor when a card is clicked', async () => {
    mockGetRecommended.mockResolvedValue([rec('d1', 'Aaa Wines')]);
    render(<RecommendedSuppliers />);
    fireEvent.click(await screen.findByRole('button', { name: /Aaa Wines/ }));
    expect(mockPush).toHaveBeenCalledWith('/aaa-wines');
  });

  it('shows a logo image when present and initials otherwise', async () => {
    mockGetRecommended.mockResolvedValue([
      rec('d1', 'Aaa Wines', { logoUrl: 'https://cdn.example.com/x.jpg' }),
      rec('d2', 'Bee Bakery'),
    ]);
    const { container } = render(<RecommendedSuppliers />);
    await screen.findByText('Aaa Wines');
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.example.com/x.jpg',
    );
    expect(screen.getByText('BB')).toBeInTheDocument();
  });

  it('shows the inert invite card when there is nothing to recommend', async () => {
    mockGetRecommended.mockResolvedValue([]);
    render(<RecommendedSuppliers />);
    const invite = await screen.findByText(/Ask them to join/);
    expect(invite).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ask them to join/i })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByLabelText('Scroll left')).toBeNull();
  });

  it('only shows scroll arrows when the list can overflow', async () => {
    mockGetRecommended.mockResolvedValue([
      rec('d1', 'Alpha Foods'),
      rec('d2', 'Bravo Bakery'),
      rec('d3', 'Cider House'),
      rec('d4', 'Delta Dairy'),
    ]);
    render(<RecommendedSuppliers />);
    await screen.findByText('Alpha Foods');
    expect(screen.getByLabelText('Scroll left')).toBeInTheDocument();
  });

  it('renders nothing when the feed fails', async () => {
    mockGetRecommended.mockRejectedValue(new Error('boom'));
    const { container } = render(<RecommendedSuppliers />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
