import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { DistributorInfo } from '@wholo/types';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('./CondensedShopHeader', () => ({ CondensedShopHeader: () => <div data-testid="condensed" /> }));
vi.mock('./AmberOrderByBar', () => ({ AmberOrderByBar: () => <div data-testid="amber" /> }));
vi.mock('./CatalogueSearchField', () => ({
  CatalogueSearchField: ({ className }: { className?: string }) => <div data-testid="search-field" className={className} />,
}));
vi.mock('./StorefrontTabs', async () => {
  const actual = await vi.importActual<typeof import('./StorefrontTabs')>('./StorefrontTabs');
  return {
    ...actual,
    StorefrontTabs: ({ tabs }: { tabs: { mode: string } }) => <div data-testid="tabs">{tabs.mode}</div>,
  };
});

import { StickyShopBlock } from './StickyShopBlock';

const distributor = { name: 'Winos' } as DistributorInfo;

function renderBlock(mode: 'spy' | 'link') {
  const tabs =
    mode === 'spy'
      ? ({ mode: 'spy', activeSection: 'catalogue', onSelectSection: vi.fn() } as const)
      : ({ mode: 'link' } as const);
  return render(
    <StickyShopBlock
      slug="winos"
      distributor={distributor}
      relationshipStatus={null}
      scrolledPast={false}
      tabs={tabs}
    />,
  );
}

describe('StickyShopBlock', () => {
  it('publishes --sticky-stack-h on mount and clears it on unmount', () => {
    const { unmount } = renderBlock('spy');
    expect(document.documentElement.style.getPropertyValue('--sticky-stack-h')).not.toBe('');
    unmount();
    expect(document.documentElement.style.getPropertyValue('--sticky-stack-h')).toBe('');
  });

  it('forwards the tabs config and renders the real search field in spy mode', () => {
    renderBlock('spy');
    expect(screen.getByTestId('tabs')).toHaveTextContent('spy');
    expect(screen.getByTestId('search-field')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Search products/ })).toBeNull();
  });

  it('lets the search field shrink instead of overflowing the row (no flex-shrink-0)', () => {
    renderBlock('spy');
    expect(screen.getByTestId('search-field').className).not.toContain('flex-shrink-0');
  });

  it('aligns the row padding with the rest of the storefront content', () => {
    const { container } = renderBlock('spy');
    const row = screen.getByTestId('tabs').closest('div.mx-auto') as HTMLElement;
    expect(row.className).toContain('md:px-8');
  });

  it('renders a link back to the catalogue instead of the search field in link mode', () => {
    renderBlock('link');
    expect(screen.getByTestId('tabs')).toHaveTextContent('link');
    expect(screen.queryByTestId('search-field')).toBeNull();
    expect(screen.getByRole('link', { name: /Search products/ })).toHaveAttribute('href', '/winos#catalogue');
  });
});
