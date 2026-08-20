import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarkReadyDialog } from './MarkReadyDialog';

describe('MarkReadyDialog', () => {
  it('shows the run name', () => {
    render(<MarkReadyDialog runName="Yorkshire" submitting={false} onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('Mark Yorkshire ready?')).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    render(<MarkReadyDialog runName="Yorkshire" submitting={false} onCancel={onCancel} onConfirm={() => {}} />);

    await userEvent.click(screen.getByText('Cancel'));

    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm when Mark ready is clicked', async () => {
    const onConfirm = vi.fn();
    render(<MarkReadyDialog runName="Yorkshire" submitting={false} onCancel={() => {}} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByText('Mark ready'));

    expect(onConfirm).toHaveBeenCalled();
  });

  it('disables both buttons and shows submitting state', () => {
    render(<MarkReadyDialog runName="Yorkshire" submitting onCancel={() => {}} onConfirm={() => {}} />);

    expect(screen.getByText('Cancel')).toBeDisabled();
    expect(screen.getByText('Marking ready…')).toBeDisabled();
  });
});
