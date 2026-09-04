import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DeliveryOutcomeDetail } from '@wholo/types';
import { DeliveryOutcomeType, DeliveryDropMethod, UnableToDeliverReason } from '@wholo/types';
import { ProofOfDeliveryDrawer } from './ProofOfDeliveryDrawer';

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

// Leaf components have their own specs; stub the ones that touch canvas / maplibre.
vi.mock('./DeliverySignature', () => ({
  DeliverySignature: ({ signature }: { signature: unknown }) => (
    <div data-testid="signature">{signature ? 'has-signature' : 'no-signature'}</div>
  ),
}));
vi.mock('./DeliveryLocationMap', () => ({
  DeliveryLocationMap: ({ latitude, longitude }: { latitude: number; longitude: number }) => (
    <div data-testid="map">{latitude},{longitude}</div>
  ),
}));

const mockGetDeliveryOutcome = vi.fn();

vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return {
    ...actual,
    adminOrdersApi: { getDeliveryOutcome: (...a: unknown[]) => mockGetDeliveryOutcome(...a) },
  };
});

function makeOutcome(overrides: Partial<DeliveryOutcomeDetail> = {}): DeliveryOutcomeDetail {
  return {
    id: 'outcome-1',
    orderId: 'order-1',
    orderNumber: 'ORD-2026-00386',
    orderStatus: 'DELIVERED' as DeliveryOutcomeDetail['orderStatus'],
    customerName: 'Blackbird Kitchen',
    driverName: 'James Vine',
    runName: 'Tuesday City Run',
    runDeliveryDate: '2026-08-28',
    outcome: DeliveryOutcomeType.DELIVERED,
    recipientName: 'Alex Morgan',
    deliveryNotes: null,
    unableReason: null,
    unableReasonNote: null,
    dropMethod: DeliveryDropMethod.HANDED_TO_PERSON,
    signature: { format: 'signature_pad', version: 5, width: 300, height: 150, strokes: [] },
    deviceCapturedAt: '2026-08-28T14:30:00.000Z',
    serverRecordedAt: '2026-08-28T14:32:00.000Z',
    location: { available: true, latitude: 51.51, longitude: -0.12, accuracyM: 12, capturedAt: '2026-08-28T14:29:00.000Z' },
    submittedViaQrToken: true,
    correctedAt: null,
    correctedByName: null,
    photos: [
      { id: 'p1', url: 'https://signed/p1-full', thumbnailUrl: 'https://signed/p1-thumb', width: 1600, height: 1200, capturedAt: null, sortOrder: 0 },
    ],
    ...overrides,
  };
}

describe('ProofOfDeliveryDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a spinner then renders the delivered outcome', async () => {
    mockGetDeliveryOutcome.mockResolvedValue(makeOutcome());
    render(<ProofOfDeliveryDrawer orderId="order-1" orderNumber="ORD-2026-00386" onClose={vi.fn()} />);

    expect(await screen.findByText('Delivered')).toBeInTheDocument();
    expect(screen.getByText('Alex Morgan')).toBeInTheDocument();
    expect(screen.getByText('James Vine')).toBeInTheDocument();
    expect(screen.getByText('Handed to a person')).toBeInTheDocument();
    expect(screen.getByText(/Via QR link/)).toBeInTheDocument();
    expect(screen.getByTestId('signature')).toHaveTextContent('has-signature');
    expect(screen.getByTestId('map')).toHaveTextContent('51.51,-0.12');
    expect(mockGetDeliveryOutcome).toHaveBeenCalledWith('order-1');
  });

  it('renders an unable-to-deliver outcome with its reason and no map when location is unavailable', async () => {
    mockGetDeliveryOutcome.mockResolvedValue(
      makeOutcome({
        outcome: DeliveryOutcomeType.UNABLE_TO_DELIVER,
        orderStatus: 'DELIVERY_FAILED' as DeliveryOutcomeDetail['orderStatus'],
        dropMethod: null,
        signature: null,
        recipientName: null,
        unableReason: UnableToDeliverReason.CUSTOMER_CLOSED,
        location: { available: false, latitude: null, longitude: null, accuracyM: null, capturedAt: null },
      }),
    );
    render(<ProofOfDeliveryDrawer orderId="order-1" orderNumber="ORD-2026-00386" onClose={vi.fn()} />);

    expect(await screen.findByText('Unable to deliver')).toBeInTheDocument();
    expect(screen.getByText('Customer closed')).toBeInTheDocument();
    expect(screen.getByText('Location unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });

  it('shows an empty state when no outcome has been recorded (404)', async () => {
    const { ApiError } = await import('@wholo/admin-api-client');
    mockGetDeliveryOutcome.mockRejectedValue(new ApiError({ title: 'Not found' } as never, 404));
    render(<ProofOfDeliveryDrawer orderId="order-1" orderNumber="ORD-2026-00386" onClose={vi.fn()} />);

    expect(await screen.findByText(/No proof of delivery has been recorded/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View order' })).toHaveAttribute('href', '/orders/order-1');
  });

  it('shows an error message on an unexpected failure', async () => {
    mockGetDeliveryOutcome.mockRejectedValue(new Error('boom'));
    render(<ProofOfDeliveryDrawer orderId="order-1" orderNumber="ORD-2026-00386" onClose={vi.fn()} />);

    expect(await screen.findByText(/Could not load the proof of delivery/)).toBeInTheDocument();
  });
});
