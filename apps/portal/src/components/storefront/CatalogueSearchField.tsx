'use client';

import { useStorefrontSearch } from '@/lib/storefront-search';
import { SearchInput } from '@/components/SearchInput';

/**
 * The storefront's in-shop product search — bound to the shared
 * `StorefrontSearchContext` so the desktop copy (in the sticky shop block) and
 * the mobile copy (top of the catalogue section) stay in sync and survive
 * navigation. On the first keystroke it scrolls the catalogue into view.
 */
export function CatalogueSearchField({ className }: { className?: string }) {
  const { search, setSearch, productCount } = useStorefrontSearch();

  function handleChange(value: string) {
    const wasEmpty = search === '';
    setSearch(value);
    if (value && wasEmpty) {
      document.getElementById('catalogue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <SearchInput
      value={search}
      onChange={handleChange}
      placeholder={productCount != null ? `Search all ${productCount} products` : 'Search products…'}
      className={className}
    />
  );
}
