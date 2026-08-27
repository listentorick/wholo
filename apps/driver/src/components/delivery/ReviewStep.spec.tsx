import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewStep } from './ReviewStep';

describe('ReviewStep', () => {
  it('blocks Submit until the irreversibility checkbox is checked', async () => {
    const onConfirm = vi.fn();
    render(<ReviewStep outcome={{ outcome: 'DELIVERED' }} onConfirm={onConfirm} onBack={vi.fn()} submitting={false} error={null} />);

    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('shows the outcome, reason, and note for an Unable to deliver review', () => {
    render(
      <ReviewStep
        outcome={{ outcome: 'UNABLE_TO_DELIVER', unableReason: 'OTHER', unableReasonNote: 'Road closed' }}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        submitting={false}
        error={null}
      />,
    );

    expect(screen.getByText('Unable to deliver')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText('Road closed')).toBeInTheDocument();
  });

  it('disables Submit while a submission is in flight, even if checked', async () => {
    render(<ReviewStep outcome={{ outcome: 'DELIVERED' }} onConfirm={vi.fn()} onBack={vi.fn()} submitting={true} error={null} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
  });

  it('surfaces a submission error', () => {
    render(
      <ReviewStep outcome={{ outcome: 'DELIVERED' }} onConfirm={vi.fn()} onBack={vi.fn()} submitting={false} error="This delivery has already been recorded" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('This delivery has already been recorded');
  });
});
