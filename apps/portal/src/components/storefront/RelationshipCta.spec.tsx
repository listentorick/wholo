import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeRelationshipStatus } from '@wholo/types';

const requestAccess = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/distributor-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/distributor-context')>('@/lib/distributor-context');
  return { ...actual, useDistributor: () => ({ requestAccess }) };
});

vi.mock('@/components/ConnectConfirmationModal', () => ({
  ConnectConfirmationModal: ({ onConfirm }: { onConfirm: (b: boolean) => void }) => (
    <button data-testid="confirm-modal" onClick={() => onConfirm(true)}>
      confirm
    </button>
  ),
}));

import { RelationshipCta } from './RelationshipCta';

beforeEach(() => vi.clearAllMocks());

describe('RelationshipCta', () => {
  it('renders nothing when the relationship is ACTIVE', () => {
    const { container } = render(
      <RelationshipCta distributorName="Winos" relationshipStatus={TradeRelationshipStatus.ACTIVE} variant="section" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('opens the confirm modal and calls requestAccess on confirm (connect)', async () => {
    render(<RelationshipCta distributorName="Winos" relationshipStatus="NONE" variant="header" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add this supplier' }));
    fireEvent.click(screen.getByTestId('confirm-modal'));
    await waitFor(() => expect(requestAccess).toHaveBeenCalledWith(true));
  });

  it('shows the explainer copy only in the section variant', () => {
    const { rerender } = render(
      <RelationshipCta distributorName="Winos" relationshipStatus="NONE" variant="section" />,
    );
    expect(screen.getByText(/Request access to see your pricing/)).toBeInTheDocument();
    rerender(<RelationshipCta distributorName="Winos" relationshipStatus="NONE" variant="header" />);
    expect(screen.queryByText(/Request access to see your pricing/)).toBeNull();
  });

  it('shows a Pending badge for a pending request', () => {
    render(
      <RelationshipCta
        distributorName="Winos"
        relationshipStatus={TradeRelationshipStatus.PENDING_REQUEST}
        variant="section"
      />,
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add this supplier' })).toBeNull();
  });

  it('shows a Suspended badge for a suspended relationship', () => {
    render(
      <RelationshipCta
        distributorName="Winos"
        relationshipStatus={TradeRelationshipStatus.SUSPENDED}
        variant="header"
      />,
    );
    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });
});
