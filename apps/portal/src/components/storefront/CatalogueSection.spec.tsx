import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogueProduct } from '@wholo/types';

vi.mock('./ProductCard', () => ({
  ProductCard: ({ product }: { product: CatalogueProduct }) => <div data-testid="product">{product.name}</div>,
}));
vi.mock('./CatalogueSearchField', () => ({ CatalogueSearchField: () => <div data-testid="cat-search" /> }));

let mockDebouncedSearch: string;
vi.mock('@/lib/storefront-search', () => ({
  useStorefrontSearch: () => ({ debouncedSearch: mockDebouncedSearch }),
}));

import { CatalogueSection } from './CatalogueSection';

const products: CatalogueProduct[] = [
  { id: 'p1', name: 'Pinot Noir', description: null, sku: null, price: '10', resolvedPrice: null, productType: null },
  { id: 'p2', name: 'Chardonnay', description: null, sku: null, price: '9', resolvedPrice: null, productType: null },
];

beforeEach(() => {
  mockDebouncedSearch = '';
});

function renderSection(overrides: Partial<Parameters<typeof CatalogueSection>[0]> = {}) {
  const onLoadMore = overrides.onLoadMore ?? vi.fn();
  const utils = render(
    <CatalogueSection
      slug="winos"
      currencyCode="GBP"
      canOrder
      products={products}
      quantities={{}}
      savingItems={new Set()}
      onQtyChange={vi.fn()}
      loading={false}
      loadingMore={false}
      hasMore={false}
      onLoadMore={onLoadMore}
      error={null}
      {...overrides}
    />,
  );
  return { onLoadMore, ...utils };
}

describe('CatalogueSection', () => {
  it('renders the #catalogue scroll section with a 2/4-column grid + the (mobile) search field', () => {
    const { container } = renderSection();
    const section = container.querySelector('section#catalogue');
    expect(section).toHaveAttribute('data-scroll-section');
    expect(container.querySelector('ul')?.className).toContain('grid-cols-2');
    expect(container.querySelector('ul')?.className).toContain('lg:grid-cols-4');
    expect(screen.getAllByTestId('product')).toHaveLength(2);
    expect(screen.getByTestId('cat-search')).toBeInTheDocument();
  });

  it('has no sort / stock filter controls', () => {
    renderSection();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText('Best match')).toBeNull();
  });

  it('shows a spinner on the first load and the error message on failure', () => {
    const { rerender } = renderSection({ products: [], loading: true });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    rerender(
      <CatalogueSection
        slug="winos"
        currencyCode="GBP"
        canOrder
        products={[]}
        quantities={{}}
        savingItems={new Set()}
        onQtyChange={vi.fn()}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={vi.fn()}
        error="Failed to load products. Please try again."
      />,
    );
    expect(screen.getByText('Failed to load products. Please try again.')).toBeInTheDocument();
  });

  it('shows a search-specific empty state driven by the debounced search term', () => {
    mockDebouncedSearch = 'rioja';
    renderSection({ products: [] });
    expect(screen.getByText(/No products match/)).toHaveTextContent('rioja');
  });

  it('calls onLoadMore from the Load more button when there is more', () => {
    const { onLoadMore } = renderSection({ hasMore: true });
    fireEvent.click(screen.getByRole('button', { name: 'Load more products' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('hides Load more when there is no next page', () => {
    renderSection({ hasMore: false });
    expect(screen.queryByRole('button', { name: /Load more/ })).toBeNull();
  });
});
