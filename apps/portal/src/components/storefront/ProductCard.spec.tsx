import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { CatalogueProduct } from '@wholo/types';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { ProductCard, formatPrice } from './ProductCard';

const product: CatalogueProduct = {
  id: 'p1',
  name: 'Long Barn Pinot Noir 2022',
  description: null,
  sku: 'WIN0262',
  price: '10.39',
  resolvedPrice: null,
  productType: null,
  thumbnailUrl: null,
};

function renderCard(overrides: Partial<Parameters<typeof ProductCard>[0]> = {}) {
  const onQtyChange = vi.fn();
  render(
    <ProductCard
      product={product}
      slug="winos"
      currencyCode="GBP"
      qty={0}
      saving={false}
      canOrder={false}
      onQtyChange={onQtyChange}
      {...overrides}
    />,
  );
  return onQtyChange;
}

describe('ProductCard', () => {
  it('shows the name, SKU and price line', () => {
    renderCard();
    expect(screen.getByText('Long Barn Pinot Noir 2022')).toBeInTheDocument();
    expect(screen.getByText('WIN0262')).toBeInTheDocument();
    expect(screen.getByText('£10.39 per item · excl. VAT')).toBeInTheDocument();
  });

  it('links the name and image to the product detail page', () => {
    renderCard();
    const links = screen.getAllByRole('link');
    expect(links.every((a) => a.getAttribute('href') === '/winos/products/p1')).toBe(true);
  });

  it('renders the placeholder when there is no thumbnail', () => {
    const { container } = render(
      <ProductCard
        product={product}
        slug="winos"
        currencyCode="GBP"
        qty={0}
        saving={false}
        canOrder={false}
        onQtyChange={vi.fn()}
      />,
    );
    expect(container.querySelector('.product-img-placeholder')).toBeInTheDocument();
  });

  it('shows the stepper only when the customer can order, and reports quantity changes', () => {
    const { rerender } = render(
      <ProductCard
        product={product}
        slug="winos"
        currencyCode="GBP"
        qty={0}
        saving={false}
        canOrder={false}
        onQtyChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Increase quantity/i })).toBeNull();

    const onQtyChange = vi.fn();
    rerender(
      <ProductCard
        product={product}
        slug="winos"
        currencyCode="GBP"
        qty={0}
        saving={false}
        canOrder
        onQtyChange={onQtyChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: `Increase quantity for ${product.name}` }));
    expect(onQtyChange).toHaveBeenCalledWith(1);
  });

  it('formatPrice falls back to "Price on request" for a null price', () => {
    expect(formatPrice(null, 'GBP')).toBe('Price on request');
  });
});
