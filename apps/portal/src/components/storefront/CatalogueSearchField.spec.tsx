import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockCtx: {
  search: string;
  setSearch: (s: string) => void;
  productCount: number | null;
};

vi.mock('@/lib/storefront-search', () => ({ useStorefrontSearch: () => mockCtx }));

import { CatalogueSearchField } from './CatalogueSearchField';

beforeEach(() => {
  mockCtx = { search: '', setSearch: vi.fn(), productCount: null };
  document.body.innerHTML = '<div id="catalogue"></div>';
  Element.prototype.scrollIntoView = vi.fn();
});

describe('CatalogueSearchField', () => {
  it('binds the input to the context value and placeholder count', () => {
    mockCtx.search = 'rio';
    mockCtx.productCount = 42;
    render(<CatalogueSearchField />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    expect(input.value).toBe('rio');
    expect(input.placeholder).toBe('Search all 42 products');
  });

  it('reports changes through setSearch', () => {
    render(<CatalogueSearchField />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'rioja' } });
    expect(mockCtx.setSearch).toHaveBeenCalledWith('rioja');
  });

  it('scrolls to the catalogue on the first non-empty keystroke only', () => {
    const { rerender } = render(<CatalogueSearchField />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'r' } });
    expect(document.getElementById('catalogue')!.scrollIntoView).toHaveBeenCalledTimes(1);

    mockCtx.search = 'r';
    rerender(<CatalogueSearchField />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ri' } });
    expect(document.getElementById('catalogue')!.scrollIntoView).toHaveBeenCalledTimes(1); // no re-scroll
  });
});
