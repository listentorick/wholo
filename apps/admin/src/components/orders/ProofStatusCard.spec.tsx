import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DeliveryOutcomeType } from '@wholo/types';
import { ProofStatusCard } from './ProofStatusCard';

describe('ProofStatusCard', () => {
  it('renders a green "Delivered" card with the recorded time', () => {
    const { container } = render(
      <ProofStatusCard outcome={DeliveryOutcomeType.DELIVERED} recordedAt="2026-08-28T14:32:00.000Z" />,
    );
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.getByText(/28 Aug 2026/)).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('green');
  });

  it('renders an amber "Unable to deliver" exception card', () => {
    const { container } = render(
      <ProofStatusCard outcome={DeliveryOutcomeType.UNABLE_TO_DELIVER} recordedAt="2026-08-28T14:32:00.000Z" />,
    );
    expect(screen.getByText('Unable to deliver')).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('amber');
  });
});
