import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  relationshipStatus: string | null;
  relationshipMinSpend: number | null;
  effectiveMinSpend: number | null;
  requestAccess: (recentContact: boolean) => Promise<void>;
};

vi.mock('@/lib/distributor-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/distributor-context')>('@/lib/distributor-context');
  return {
    ...actual,
    useDistributor: () => mockDistributorValue,
  };
});

beforeEach(() => {
  mockDeliveryParts = null;
  mockDistributorValue = {
    distributor: baseDistributor,
    relationshipStatus: 'NONE',
    relationshipMinSpend: null,
    effectiveMinSpend: null,
    requestAccess: vi.fn().mockResolvedValue(undefined),
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
    mockDistributorValue.relationshipStatus = 'NONE';
    mockDistributorValue.effectiveMinSpend = 150;
    render(<DistributorHomePage />);
    expect(screen.getByText('£150.00')).toBeInTheDocument();
    expect(screen.getByText('minimum order')).toBeInTheDocument();
  });

  it('shows the relationship-specific minimum order value once connected', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 1 };
    mockDistributorValue.relationshipStatus = 'ACTIVE';
    mockDistributorValue.effectiveMinSpend = 75;
    render(<DistributorHomePage />);
    expect(screen.getByText('£75.00')).toBeInTheDocument();
  });

  it('hides the minimum order tile when not set', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 5 };
    mockDistributorValue.effectiveMinSpend = null;
    render(<DistributorHomePage />);
    expect(screen.queryByText('minimum order')).toBeNull();
  });

  it('shows delivery info only when a relationship exists', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 1 };
    mockDistributorValue.relationshipStatus = 'ACTIVE';
    mockDeliveryParts = { time: '6:00pm', cutoffDayLabel: 'today', dayName: 'Wednesday', dayOrdinal: '30th' };
    render(<DistributorHomePage />);
    expect(screen.getByText(/Order by/)).toBeInTheDocument();
  });

  it('does not show delivery info pre-relationship', () => {
    mockDistributorValue.distributor = { ...baseDistributor, minimumOrderSpend: 100 };
    mockDistributorValue.relationshipStatus = 'NONE';
    mockDeliveryParts = null;
    render(<DistributorHomePage />);
    expect(screen.queryByText(/Order by/)).toBeNull();
  });

  it('shows the "Connect with this business" CTA pre-relationship', () => {
    mockDistributorValue.relationshipStatus = 'NONE';
    render(<DistributorHomePage />);
    expect(screen.getByRole('button', { name: 'Connect with this business' })).toBeInTheDocument();
  });

  it('hides the CTA once a relationship exists', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 1 };
    mockDistributorValue.relationshipStatus = 'ACTIVE';
    render(<DistributorHomePage />);
    expect(screen.queryByRole('button', { name: 'Connect with this business' })).toBeNull();
  });

  it('does not render a fixed floating CTA bar (moved into Key Info)', () => {
    mockDistributorValue.relationshipStatus = 'NONE';
    const { container } = render(<DistributorHomePage />);
    expect(container.querySelector('.fixed')).toBeNull();
  });

  it('hides Key Info entirely when there is nothing to show', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 0, minimumOrderSpend: null };
    mockDistributorValue.relationshipStatus = 'ACTIVE';
    render(<DistributorHomePage />);
    expect(screen.queryByText('Key Info')).toBeNull();
  });

  it('shows a locked Pending badge instead of the CTA when a request is pending', () => {
    mockDistributorValue.relationshipStatus = 'PENDING_REQUEST';
    render(<DistributorHomePage />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect with this business' })).toBeNull();
  });

  it('shows a locked Suspended message with no CTA when suspended', () => {
    mockDistributorValue.relationshipStatus = 'SUSPENDED';
    render(<DistributorHomePage />);
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('Suspended — contact this wholesaler')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect with this business' })).toBeNull();
  });

  it('opens the confirmation modal when the Connect CTA is clicked', () => {
    mockDistributorValue.distributor = { ...baseDistributor, name: 'Winos Co' };
    mockDistributorValue.relationshipStatus = 'NONE';
    render(<DistributorHomePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect with this business' }));
    expect(
      screen.getByText('Have you spoken with or ordered from Winos Co in the last 90 days?'),
    ).toBeInTheDocument();
  });

  it('calls requestAccess with the answer and closes the modal on success', async () => {
    mockDistributorValue.relationshipStatus = 'NONE';
    render(<DistributorHomePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect with this business' }));
    fireEvent.click(screen.getByRole('button', { name: /Yes, we're already in touch/ }));

    await waitFor(() => expect(mockDistributorValue.requestAccess).toHaveBeenCalledWith(true));
    await waitFor(() =>
      expect(
        screen.queryByText('Have you spoken with or ordered from Winos in the last 90 days?'),
      ).toBeNull(),
    );
  });

  it('does not create a request when the modal is dismissed without answering', () => {
    mockDistributorValue.relationshipStatus = 'NONE';
    render(<DistributorHomePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect with this business' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(mockDistributorValue.requestAccess).not.toHaveBeenCalled();
    expect(screen.queryByText(/Have you spoken with or ordered from/)).toBeNull();
  });
});
