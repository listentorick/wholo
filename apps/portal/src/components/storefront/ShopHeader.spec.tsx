import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DistributorInfo } from '@wholo/types';

vi.mock('./RelationshipCta', () => ({ RelationshipCta: () => <div data-testid="cta" /> }));

let mockOrderCount: number | null;
vi.mock('@/lib/hooks/use-viewer-order-count', () => ({ useViewerOrderCount: () => mockOrderCount }));

import { ShopHeader } from './ShopHeader';

const base: DistributorInfo = {
  id: 'd1',
  name: 'Mere Wine Co',
  slug: 'mere',
  logoUrl: null,
  bannerUrl: null,
  bannerDominantColor: null,
  tagline: 'Passionate about wine since 2012',
  aboutText: null,
  email: null,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  addressCity: 'Cheshire',
  addressState: null,
  addressPostcode: null,
  addressCountry: 'UK',
  minimumOrderSpend: null,
  currencyCode: 'GBP',
  customerCount: 0,
  processingDays: [1, 2, 3, 4, 5],
};

beforeEach(() => {
  mockOrderCount = null;
});

function renderHeader() {
  render(<ShopHeader distributor={base} relationshipStatus={null} onScrolledPast={vi.fn()} />);
}

describe('ShopHeader', () => {
  it('shows the name, location · tagline line and the relationship CTA', () => {
    renderHeader();
    expect(screen.getByRole('heading', { name: 'Mere Wine Co' })).toBeInTheDocument();
    expect(screen.getByText('Cheshire, UK')).toBeInTheDocument();
    expect(screen.getByText('Passionate about wine since 2012')).toBeInTheDocument();
    expect(screen.getByTestId('cta')).toBeInTheDocument();
  });

  it('shows the order-count line only for a positive count', () => {
    mockOrderCount = 7;
    renderHeader();
    expect(screen.getByText('7 orders with this supplier')).toBeInTheDocument();
  });

  it('hides the order-count line at 0 / null', () => {
    mockOrderCount = 0;
    renderHeader();
    expect(screen.queryByText(/with this supplier/)).toBeNull();
  });

  it('renders an inert (disabled) Message button', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Message' })).toBeDisabled();
  });
});
