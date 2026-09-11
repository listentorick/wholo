'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const SEARCH_DEBOUNCE_MS = 300;

interface StorefrontSearchValue {
  /** Live input value. */
  search: string;
  setSearch: (s: string) => void;
  /** `search` trimmed + debounced by 300ms — what the catalogue fetch keys on. */
  debouncedSearch: string;
  /** Last successful catalogue total, for the "Search all N products" placeholder. */
  productCount: number | null;
  setProductCount: (n: number | null) => void;
}

const StorefrontSearchContext = createContext<StorefrontSearchValue>({
  search: '',
  setSearch: () => {},
  debouncedSearch: '',
  productCount: null,
  setProductCount: () => {},
});

/**
 * The distributor storefront's catalogue-search UI state, provided above the
 * route switch in `DistributorMain`. The persistent storefront chrome's search
 * field and the (remounting) storefront page share one value through this, so
 * they can't desync and the query survives storefront ⇄ product navigation.
 */
export function StorefrontSearchProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [productCount, setProductCount] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <StorefrontSearchContext.Provider
      value={{ search, setSearch, debouncedSearch, productCount, setProductCount }}
    >
      {children}
    </StorefrontSearchContext.Provider>
  );
}

export function useStorefrontSearch() {
  return useContext(StorefrontSearchContext);
}
