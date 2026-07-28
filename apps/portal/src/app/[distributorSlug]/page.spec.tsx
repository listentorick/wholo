import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import DistributorHomePage from './page';
import type { DistributorInfo } from '@wholo/types';

vi.mock('next/navigation', () => ({
  useParams: () => ({ distributorSlug: 'winos' }),
  usePathname: () => '/winos',
}));

vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ user: { id: 'u1', organisationId: 'org-1' }, accessToken: 'tok', isLoading: false }),
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

let mockDeliveryParts: { time: string; cutoffDayLabel: string; dayName: string; dayOrdinal: string } | null = null;
vi.mock('@/lib/hooks/use-delivery-parts', () => ({
  useDeliveryParts: () => mockDeliveryParts,
}));

const baseDistributor: DistributorInfo = {
  id: 'dist-1',
  name: 'Winos',
  slug: 'winos',
  logoUrl: null,
  bannerUrl: null,
  bannerDominantColor: null,
  tagline: null,
  aboutText: null,
  email: null,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  addressCity: null,
  addressState: null,
  addressPostcode: null,
  addressCountry: null,
  minimumOrderSpend: null,
  customerCount: 0,
};

let mockDistributorValue: {
  distributor: DistributorInfo | null;
  hasRelationship: boolean | null;
  relationshipMinSpend: number | null;
};

vi.mock('@/lib/distributor-context', () => ({
  useDistributor: () => mockDistributorValue,
}));

beforeEach(() => {
  mockDeliveryParts = null;
  mockDistributorValue = {
    distributor: baseDistributor,
    hasRelationship: false,
    relationshipMinSpend: null,
  };
});

describe('DistributorHomePage — Key Info', () => {
  it('shows the active customer count when above zero', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 42 };
    render(<DistributorHomePage />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('active customers')).toBeInTheDocument();
  });

  it('hides the customer count tile when zero', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 0, minimumOrderSpend: 100 };
    render(<DistributorHomePage />);
    expect(screen.queryByText('active customers')).toBeNull();
  });

  it('shows the distributor default minimum order value pre-relationship', () => {
    mockDistributorValue.distributor = { ...baseDistributor, minimumOrderSpend: 150 };
    mockDistributorValue.hasRelationship = false;
    render(<DistributorHomePage />);
    expect(screen.getByText('£150.00')).toBeInTheDocument();
    expect(screen.getByText('minimum order')).toBeInTheDocument();
  });

  it('shows the relationship-specific minimum order value once connected', () => {
    mockDistributorValue.distributor = { ...baseDistributor, minimumOrderSpend: 150, customerCount: 1 };
    mockDistributorValue.hasRelationship = true;
    mockDistributorValue.relationshipMinSpend = 75;
    render(<DistributorHomePage />);
    expect(screen.getByText('£75.00')).toBeInTheDocument();
  });

  it('hides the minimum order tile when not set', () => {
    mockDistributorValue.distributor = { ...baseDistributor, minimumOrderSpend: null, customerCount: 5 };
    render(<DistributorHomePage />);
    expect(screen.queryByText('minimum order')).toBeNull();
  });

  it('shows delivery info only when a relationship exists', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 1 };
    mockDistributorValue.hasRelationship = true;
    mockDeliveryParts = { time: '6:00pm', cutoffDayLabel: 'today', dayName: 'Wednesday', dayOrdinal: '30th' };
    render(<DistributorHomePage />);
    expect(screen.getByText(/Order by/)).toBeInTheDocument();
  });

  it('does not show delivery info pre-relationship', () => {
    mockDistributorValue.distributor = { ...baseDistributor, minimumOrderSpend: 100 };
    mockDistributorValue.hasRelationship = false;
    mockDeliveryParts = null;
    render(<DistributorHomePage />);
    expect(screen.queryByText(/Order by/)).toBeNull();
  });

  it('shows the "Connect with this business" CTA pre-relationship', () => {
    mockDistributorValue.hasRelationship = false;
    render(<DistributorHomePage />);
    expect(screen.getByRole('button', { name: 'Connect with this business' })).toBeInTheDocument();
  });

  it('hides the CTA once a relationship exists', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 1 };
    mockDistributorValue.hasRelationship = true;
    render(<DistributorHomePage />);
    expect(screen.queryByRole('button', { name: 'Connect with this business' })).toBeNull();
  });

  it('does not render a fixed floating CTA bar (moved into Key Info)', () => {
    mockDistributorValue.hasRelationship = false;
    const { container } = render(<DistributorHomePage />);
    expect(container.querySelector('.fixed')).toBeNull();
  });

  it('hides Key Info entirely when there is nothing to show', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 0, minimumOrderSpend: null };
    mockDistributorValue.hasRelationship = true;
    render(<DistributorHomePage />);
    expect(screen.queryByText('Key Info')).toBeNull();
  });
});
