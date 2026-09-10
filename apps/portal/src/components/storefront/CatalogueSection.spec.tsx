import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { CatalogueProduct } from '@wholo/types';

vi.mock('./ProductCard', () => ({
  ProductCard: ({ product }: { product: CatalogueProduct }) => <div data-testid="product">{product.name}</div>,
}));

import { CatalogueSection } from './CatalogueSection';

const products: CatalogueProduct[] = [
  { id: 'p1', name: 'Pinot Noir', description: null, sku: null, price: '10', resolvedPrice: null, productType: null },
  { id: 'p2', name: 'Chardonnay', description: null, sku: null, price: '9', resolvedPrice: null, productType: null },
];

function renderSection(overrides: Partial<Parameters<typeof CatalogueSection>[0]> = {}) {
  const onLoadMore = vi.fn();
  render(
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
      searchActive={false}
      searchTerm=""
      {...overrides}
    />,
  );
  return onLoadMore;
}

describe('CatalogueSection', () => {
  it('renders the #catalogue scroll section with a 2/4-column grid', () => {
    const { container } = render(
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
        onLoadMore={vi.fn()}
        error={null}
        searchActive={false}
        searchTerm=""
      />,
    );
    const section = container.querySelector('section#catalogue');
    expect(section).toHaveAttribute('data-scroll-section');
    expect(container.querySelector('ul')?.className).toContain('grid-cols-2');
    expect(container.querySelector('ul')?.className).toContain('lg:grid-cols-4');
    expect(screen.getAllByTestId('product')).toHaveLength(2);
  });

  it('shows the inert sort / stock selects', () => {
    renderSection();
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    selects.forEach((s) => expect(s).toBeDisabled());
  });

  it('shows a spinner on the first load and the error message on failure', () => {
    const { rerender } = render(
      <CatalogueSection
        slug="winos"
        currencyCode="GBP"
        canOrder
        products={[]}
        quantities={{}}
        savingItems={new Set()}
        onQtyChange={vi.fn()}
        loading
        loadingMore={false}
        hasMore={false}
        onLoadMore={vi.fn()}
        error={null}
        searchActive={false}
        searchTerm=""
      />,
    );
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
        searchActive={false}
        searchTerm=""
      />,
    );
    expect(screen.getByText('Failed to load products. Please try again.')).toBeInTheDocument();
  });

  it('shows a search-specific empty state', () => {
    renderSection({ products: [], searchActive: true, searchTerm: 'rioja' });
    expect(screen.getByText(/No products match/)).toHaveTextContent('rioja');
  });

  it('calls onLoadMore from the Load more button when there is more', () => {
    const onLoadMore = renderSection({ hasMore: true });
    fireEvent.click(screen.getByRole('button', { name: 'Load more products' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('hides Load more when there is no next page', () => {
    renderSection({ hasMore: false });
    expect(screen.queryByRole('button', { name: /Load more/ })).toBeNull();
  });
});
