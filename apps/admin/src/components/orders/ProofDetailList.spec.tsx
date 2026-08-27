import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { DeliveryOutcomeDetail } from '@wholo/types';
import { DeliveryOutcomeType, DeliveryDropMethod, UnableToDeliverReason } from '@wholo/types';
import { ProofDetailList } from './ProofDetailList';

function base(overrides: Partial<DeliveryOutcomeDetail> = {}): DeliveryOutcomeDetail {
  return {
    id: 'o1',
    orderId: 'order-1',
    orderNumber: 'ORD-1',
    orderStatus: 'DELIVERED' as DeliveryOutcomeDetail['orderStatus'],
    customerName: 'Blackbird Kitchen',
    driverName: 'James Vine',
    runName: 'Tuesday Run',
    runDeliveryDate: '2026-08-28',
    outcome: DeliveryOutcomeType.DELIVERED,
    recipientName: 'Alex Morgan',
    deliveryNotes: 'Front desk',
    unableReason: null,
    unableReasonNote: null,
    dropMethod: DeliveryDropMethod.HANDED_TO_PERSON,
    signature: null,
    deviceCapturedAt: '2026-08-28T14:30:00.000Z',
    serverRecordedAt: '2026-08-28T14:32:00.000Z',
    location: { available: false, latitude: null, longitude: null, accuracyM: null, capturedAt: null },
    submittedViaQrToken: true,
    correctedAt: null,
    correctedByName: null,
    photos: [],
    ...overrides,
  };
}

describe('ProofDetailList', () => {
  it('shows delivery method, recipient, driver, run and notes for a delivered outcome', () => {
    render(<ProofDetailList outcome={base()} />);
    expect(screen.getByText('Handed to a person')).toBeInTheDocument();
    expect(screen.getByText('Alex Morgan')).toBeInTheDocument();
    expect(screen.getByText('James Vine')).toBeInTheDocument();
    expect(screen.getByText(/Tuesday Run/)).toBeInTheDocument();
    expect(screen.getByText('Front desk')).toBeInTheDocument();
    expect(screen.getByText('Via QR link (unauthenticated)')).toBeInTheDocument();
  });

  it('shows the reason (and OTHER note) for an unable-to-deliver outcome, not drop method', () => {
    render(
      <ProofDetailList
        outcome={base({
          outcome: DeliveryOutcomeType.UNABLE_TO_DELIVER,
          dropMethod: null,
          recipientName: null,
          unableReason: UnableToDeliverReason.OTHER,
          unableReasonNote: 'Road closed',
        })}
      />,
    );
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText('Road closed')).toBeInTheDocument();
    expect(screen.queryByText('Received by')).not.toBeInTheDocument();
  });

  it('shows the correction line when the outcome was corrected', () => {
    render(
      <ProofDetailList outcome={base({ correctedAt: '2026-08-29T09:00:00.000Z', correctedByName: 'Sam Rae' })} />,
    );
    expect(screen.getByText('Corrected')).toBeInTheDocument();
    expect(screen.getByText(/Sam Rae/)).toBeInTheDocument();
  });
});
