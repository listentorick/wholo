import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DistributorInfo } from '@wholo/types';

let mockCtx: {
  distributor: DistributorInfo | null;
  relationshipStatus: string | null;
  shopHeaderScrolledPast: boolean;
  setShopHeaderScrolledPast: () => void;
};

const useScrollSpy = vi.fn((_a: string[], _b: boolean) => ['catalogue', vi.fn()]);

vi.mock('@/lib/distributor-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/distributor-context')>('@/lib/distributor-context');
  return { ...actual, useDistributor: () => mockCtx };
});
vi.mock('@/lib/hooks/use-scroll-spy', () => ({ useScrollSpy: (a: string[], b: boolean) => useScrollSpy(a, b) }));
vi.mock('./CoverBanner', () => ({ CoverBanner: () => <div data-testid="cover" /> }));
vi.mock('./ShopHeader', () => ({ ShopHeader: () => <div data-testid="shop-header" /> }));
vi.mock('./StickyShopBlock', () => ({
  StickyShopBlock: ({ tabs }: { tabs: { mode: string; activeSection?: string } }) => (
    <div data-testid="sticky-block" data-active-section={tabs.activeSection}>
      {tabs.mode}
    </div>
  ),
}));

import { StorefrontChrome } from './StorefrontChrome';

beforeEach(() => {
  vi.clearAllMocks();
  useScrollSpy.mockReturnValue(['catalogue', vi.fn()]);
  mockCtx = {
    distributor: { name: 'Winos', bannerUrl: null } as DistributorInfo,
    relationshipStatus: 'ACTIVE',
    shopHeaderScrolledPast: false,
    setShopHeaderScrolledPast: vi.fn(),
  };
});

describe('StorefrontChrome', () => {
  it('renders the cover banner, shop header and sticky block; link mode disables the spy', () => {
    render(<StorefrontChrome slug="winos" mode="link" />);
    expect(screen.getByTestId('cover')).toBeInTheDocument();
    expect(screen.getByTestId('shop-header')).toBeInTheDocument();
    expect(screen.getByTestId('sticky-block')).toHaveTextContent('link');
    expect(useScrollSpy).toHaveBeenCalledWith(['catalogue', 'about', 'delivery'], false);
  });

  it('highlights the Catalogue tab in link mode — a product page belongs to the catalogue', () => {
    render(<StorefrontChrome slug="winos" mode="link" />);
    expect(screen.getByTestId('sticky-block')).toHaveAttribute('data-active-section', 'catalogue');
  });

  it('runs the scroll-spy and passes spy tabs in spy mode', () => {
    render(<StorefrontChrome slug="winos" mode="spy" />);
    expect(useScrollSpy).toHaveBeenCalledWith(['catalogue', 'about', 'delivery'], true);
    expect(screen.getByTestId('sticky-block')).toHaveTextContent('spy');
  });

  it('renders nothing until the distributor is loaded', () => {
    mockCtx.distributor = null;
    const { container } = render(<StorefrontChrome slug="winos" mode="link" />);
    expect(container.firstChild).toBeNull();
  });
});
