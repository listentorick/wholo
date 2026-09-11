import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DistributorInfo } from '@wholo/types';
import type { DeliveryParts } from '@/lib/hooks/use-delivery-parts';

const base: DistributorInfo = {
  id: 'd1',
  name: 'Mere Wine Co',
  slug: 'mere',
  logoUrl: null,
  bannerUrl: null,
  bannerDominantColor: null,
  tagline: null,
  aboutText: null,
  email: 'hi@mere.co',
  phone: '01234 567890',
  addressLine1: '1 Vine St',
  addressLine2: null,
  addressCity: 'Chester',
  addressState: null,
  addressPostcode: 'CH1 1AA',
  addressCountry: 'UK',
  minimumOrderSpend: 150,
  currencyCode: 'GBP',
  customerCount: 0,
  processingDays: [1, 2, 3, 4, 5],
};

let mockCtx: {
  distributor: DistributorInfo | null;
  effectiveMinSpend: number | null;
  deliveryParts: DeliveryParts | null;
};

vi.mock('@/lib/distributor-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/distributor-context')>('@/lib/distributor-context');
  return { ...actual, useDistributor: () => mockCtx };
});

import { DeliveryTermsSection } from './DeliveryTermsSection';

const deliveryParts: DeliveryParts = {
  time: '4:00pm',
  cutoffDayLabel: 'today',
  dayName: 'Monday',
  dayOrdinal: '3rd',
};

beforeEach(() => {
  mockCtx = { distributor: base, effectiveMinSpend: 150, deliveryParts: null };
});

describe('DeliveryTermsSection', () => {
  it('renders inside a #delivery scroll section', () => {
    const { container } = render(<DeliveryTermsSection />);
    expect(container.querySelector('section#delivery')).toHaveAttribute('data-scroll-section');
  });

  it('shows the minimum spend, processing days and contact details', () => {
    render(<DeliveryTermsSection />);
    expect(screen.getByText('£150.00')).toBeInTheDocument();
    expect(screen.getByText('Monday–Friday')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '01234 567890' })).toHaveAttribute('href', 'tel:01234 567890');
    expect(screen.getByRole('link', { name: 'hi@mere.co' })).toHaveAttribute('href', 'mailto:hi@mere.co');
  });

  it('shows the delivery cut-off line only when deliveryParts is present', () => {
    const { rerender } = render(<DeliveryTermsSection />);
    expect(screen.queryByText(/Order by/)).toBeNull();
    mockCtx.deliveryParts = deliveryParts;
    rerender(<DeliveryTermsSection />);
    expect(screen.getByText(/Order by/)).toHaveTextContent('Order by 4:00pm, today for delivery on Monday 3rd');
  });

  it('omits the minimum-spend tile when there is no effective minimum', () => {
    mockCtx.effectiveMinSpend = null;
    render(<DeliveryTermsSection />);
    expect(screen.queryByText('£150.00')).toBeNull();
  });

  it('renders the empty #delivery section shell while the distributor is not loaded', () => {
    mockCtx.distributor = null;
    const { container } = render(<DeliveryTermsSection />);
    const section = container.querySelector('section#delivery');
    expect(section).toHaveAttribute('data-scroll-section');
    expect(section?.querySelector('div')).toBeNull(); // no inner card yet
  });
});
