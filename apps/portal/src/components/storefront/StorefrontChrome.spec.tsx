import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DistributorInfo } from '@wholo/types';

let mockCtx: {
  distributor: DistributorInfo | null;
  relationshipStatus: string | null;
  shopHeaderScrolledPast: boolean;
  setShopHeaderScrolledPast: () => void;
};

vi.mock('@/lib/distributor-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/distributor-context')>('@/lib/distributor-context');
  return { ...actual, useDistributor: () => mockCtx };
});
vi.mock('./CoverBanner', () => ({ CoverBanner: () => <div data-testid="cover" /> }));
vi.mock('./ShopHeader', () => ({ ShopHeader: () => <div data-testid="shop-header" /> }));
vi.mock('./StickyShopBlock', () => ({
  StickyShopBlock: ({ tabs }: { tabs: { mode: string } }) => <div data-testid="sticky-block">{tabs.mode}</div>,
}));

import { StorefrontChrome } from './StorefrontChrome';

beforeEach(() => {
  mockCtx = {
    distributor: { name: 'Winos', bannerUrl: null } as DistributorInfo,
    relationshipStatus: 'ACTIVE',
    shopHeaderScrolledPast: false,
    setShopHeaderScrolledPast: vi.fn(),
  };
});

describe('StorefrontChrome', () => {
  it('renders the cover banner, shop header and sticky block', () => {
    render(<StorefrontChrome slug="winos" tabs={{ mode: 'link' }} />);
    expect(screen.getByTestId('cover')).toBeInTheDocument();
    expect(screen.getByTestId('shop-header')).toBeInTheDocument();
    expect(screen.getByTestId('sticky-block')).toHaveTextContent('link');
  });

  it('renders nothing until the distributor is loaded', () => {
    mockCtx.distributor = null;
    const { container } = render(<StorefrontChrome slug="winos" tabs={{ mode: 'link' }} />);
    expect(container.firstChild).toBeNull();
  });
});
