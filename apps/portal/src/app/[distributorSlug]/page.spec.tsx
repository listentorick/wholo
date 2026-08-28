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
  currencyCode: 'GBP',
  customerCount: 0,
  processingDays: [1, 2, 3, 4, 5],
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
    expect(screen.getByText('Active customers')).toBeInTheDocument();
  });

  it('hides the customer count tile when zero', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 0, minimumOrderSpend: 100 };
    render(<DistributorHomePage />);
    expect(screen.queryByText('Active customers')).toBeNull();
  });

  it('shows the distributor default minimum order value pre-relationship', () => {
    mockDistributorValue.relationshipStatus = 'NONE';
    mockDistributorValue.effectiveMinSpend = 150;
    render(<DistributorHomePage />);
    expect(screen.getByText('£150.00')).toBeInTheDocument();
    expect(screen.getByText('Minimum spend')).toBeInTheDocument();
  });

  it('shows the "Orders processed" days from the distributor profile', () => {
    mockDistributorValue.distributor = { ...baseDistributor, processingDays: [1, 2, 3, 4, 5] };
    render(<DistributorHomePage />);
    expect(screen.getByText('Monday–Friday')).toBeInTheDocument();
    expect(screen.getByText('Orders processed')).toBeInTheDocument();
  });

  it('hides the "Orders processed" tile when no processing days are set', () => {
    mockDistributorValue.distributor = { ...baseDistributor, processingDays: [] };
    render(<DistributorHomePage />);
    expect(screen.queryByText('Orders processed')).toBeNull();
  });

  it('shows the relationship-specific minimum order value once connected', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 1 };
    mockDistributorValue.relationshipStatus = 'ACTIVE';
    mockDistributorValue.effectiveMinSpend = 75;
    render(<DistributorHomePage />);
    expect(screen.getByText('£75.00')).toBeInTheDocument();
  });

  it('hides the minimum spend tile when not set', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 5 };
    mockDistributorValue.effectiveMinSpend = null;
    render(<DistributorHomePage />);
    expect(screen.queryByText('Minimum spend')).toBeNull();
  });

  it('shows delivery info only when a relationship exists, above the active-customers stat', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 1 };
    mockDistributorValue.relationshipStatus = 'ACTIVE';
    mockDeliveryParts = { time: '6:00pm', cutoffDayLabel: 'today', dayName: 'Wednesday', dayOrdinal: '30th' };
    render(<DistributorHomePage />);
    const orderBy = screen.getByText(/Order by/);
    const activeCustomers = screen.getByText('Active customers');
    expect(orderBy).toBeInTheDocument();
    expect(orderBy.compareDocumentPosition(activeCustomers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not show delivery info pre-relationship', () => {
    mockDistributorValue.distributor = { ...baseDistributor, minimumOrderSpend: 100 };
    mockDistributorValue.relationshipStatus = 'NONE';
    mockDeliveryParts = null;
    render(<DistributorHomePage />);
    expect(screen.queryByText(/Order by/)).toBeNull();
  });

  it('shows the "Add this supplier" CTA and its context line pre-relationship', () => {
    mockDistributorValue.relationshipStatus = 'NONE';
    render(<DistributorHomePage />);
    expect(screen.getByRole('button', { name: 'Add this supplier' })).toBeInTheDocument();
    expect(screen.getByText('Request access to see your pricing and place orders.')).toBeInTheDocument();
  });

  it('hides the CTA and its context line once a relationship exists', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 1 };
    mockDistributorValue.relationshipStatus = 'ACTIVE';
    render(<DistributorHomePage />);
    expect(screen.queryByRole('button', { name: 'Add this supplier' })).toBeNull();
    expect(screen.queryByText('Request access to see your pricing and place orders.')).toBeNull();
  });

  it('does not render a fixed floating CTA bar (the CTA lives in the About us box)', () => {
    mockDistributorValue.relationshipStatus = 'NONE';
    const { container } = render(<DistributorHomePage />);
    expect(container.querySelector('.fixed')).toBeNull();
  });

  it('still renders the What-you-need-to-know heading when there are no stats to show', () => {
    mockDistributorValue.distributor = { ...baseDistributor, customerCount: 0, processingDays: [] };
    mockDistributorValue.effectiveMinSpend = null;
    mockDistributorValue.relationshipStatus = 'ACTIVE';
    render(<DistributorHomePage />);
    expect(screen.getByText('What you need to know')).toBeInTheDocument();
  });

  it('shows a locked Pending badge instead of the CTA when a request is pending', () => {
    mockDistributorValue.relationshipStatus = 'PENDING_REQUEST';
    render(<DistributorHomePage />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add this supplier' })).toBeNull();
  });

  it('shows a locked Suspended message with no CTA when suspended', () => {
    mockDistributorValue.relationshipStatus = 'SUSPENDED';
    render(<DistributorHomePage />);
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('Suspended — contact this wholesaler')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add this supplier' })).toBeNull();
  });

  it('opens the confirmation modal when the Connect CTA is clicked', () => {
    mockDistributorValue.distributor = { ...baseDistributor, name: 'Winos Co' };
    mockDistributorValue.relationshipStatus = 'NONE';
    render(<DistributorHomePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Add this supplier' }));
    expect(
      screen.getByText('Have you spoken with or ordered from Winos Co in the last 90 days?'),
    ).toBeInTheDocument();
  });

  it('calls requestAccess with the answer and closes the modal on success', async () => {
    mockDistributorValue.relationshipStatus = 'NONE';
    render(<DistributorHomePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Add this supplier' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Add this supplier' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(mockDistributorValue.requestAccess).not.toHaveBeenCalled();
    expect(screen.queryByText(/Have you spoken with or ordered from/)).toBeNull();
  });
});

describe('DistributorHomePage — About us', () => {
  it('renders the distributor logo in the About us box when logoUrl is set', () => {
    mockDistributorValue.distributor = {
      ...baseDistributor,
      logoUrl: 'https://cdn.example.com/winos-logo.webp',
      aboutText: 'We are Winos.',
    };
    const { container } = render(<DistributorHomePage />);
    expect(
      container.querySelector('img[src="https://cdn.example.com/winos-logo.webp"]'),
    ).not.toBeNull();
  });

  it('renders no logo image when the distributor has no logoUrl', () => {
    mockDistributorValue.distributor = { ...baseDistributor, aboutText: 'We are Winos.' };
    const { container } = render(<DistributorHomePage />);
    expect(container.querySelector('img')).toBeNull();
  });
});
