import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaxTypeUnmappedWarningModal } from './TaxTypeUnmappedWarningModal';

describe('TaxTypeUnmappedWarningModal', () => {
  it('shows the detail text', () => {
    render(
      <TaxTypeUnmappedWarningModal
        detail="Zero-rated has no confirmed mapping."
        submitting={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByText('Zero-rated has no confirmed mapping.')).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <TaxTypeUnmappedWarningModal detail="detail" submitting={false} onCancel={onCancel} onConfirm={() => {}} />,
    );

    await user.click(screen.getByText('Cancel'));

    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm when Accept anyway is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <TaxTypeUnmappedWarningModal detail="detail" submitting={false} onCancel={() => {}} onConfirm={onConfirm} />,
    );

    await user.click(screen.getByText('Accept anyway'));

    expect(onConfirm).toHaveBeenCalled();
  });

  it('disables both buttons and shows submitting state while accepting', () => {
    render(
      <TaxTypeUnmappedWarningModal detail="detail" submitting={true} onCancel={() => {}} onConfirm={() => {}} />,
    );

    expect(screen.getByText('Cancel')).toBeDisabled();
    expect(screen.getByText('Accepting…')).toBeDisabled();
  });
});
