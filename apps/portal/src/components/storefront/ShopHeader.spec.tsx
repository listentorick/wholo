import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { DistributorInfo } from '@wholo/types';

vi.mock('./RelationshipCta', () => ({ RelationshipCta: () => <div data-testid="cta" /> }));

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

function renderHeader(overrides: Partial<Parameters<typeof ShopHeader>[0]> = {}) {
  render(
    <ShopHeader
      distributor={base}
      relationshipStatus={null}
      orderCount={null}
      onScrolledPast={vi.fn()}
      {...overrides}
    />,
  );
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
    renderHeader({ orderCount: 7 });
    expect(screen.getByText('7 orders with this supplier')).toBeInTheDocument();
  });

  it('hides the order-count line at 0 / null', () => {
    renderHeader({ orderCount: 0 });
    expect(screen.queryByText(/with this supplier/)).toBeNull();
  });

  it('renders an inert (disabled) Message button', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Message' })).toBeDisabled();
  });
});
