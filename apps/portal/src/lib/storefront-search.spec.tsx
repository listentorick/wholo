import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorefrontSearchProvider, useStorefrontSearch } from './storefront-search';

function Probe() {
  const { search, setSearch, debouncedSearch, productCount, setProductCount } = useStorefrontSearch();
  return (
    <div>
      <span data-testid="search">{search}</span>
      <span data-testid="debounced">{debouncedSearch}</span>
      <span data-testid="count">{String(productCount)}</span>
      <button onClick={() => setSearch('  rioja  ')}>type</button>
      <button onClick={() => setProductCount(42)}>set-count</button>
    </div>
  );
}

describe('storefront-search context', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('trims and debounces the search value by 300ms', () => {
    render(
      <StorefrontSearchProvider>
        <Probe />
      </StorefrontSearchProvider>,
    );
    act(() => {
      screen.getByText('type').click();
    });
    expect(screen.getByTestId('search')).toHaveTextContent('rioja'); // raw value has spaces; textContent trims
    expect(screen.getByTestId('debounced').textContent).toBe('');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId('debounced').textContent).toBe('rioja');
  });

  it('holds the product count', () => {
    render(
      <StorefrontSearchProvider>
        <Probe />
      </StorefrontSearchProvider>,
    );
    expect(screen.getByTestId('count').textContent).toBe('null');
    act(() => {
      screen.getByText('set-count').click();
    });
    expect(screen.getByTestId('count').textContent).toBe('42');
  });

  it('returns inert defaults outside a provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('search').textContent).toBe('');
    act(() => {
      screen.getByText('type').click();
    });
    expect(screen.getByTestId('search').textContent).toBe('');
  });
});
