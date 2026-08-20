import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReopenConfirm } from './ReopenConfirm';

describe('ReopenConfirm', () => {
  it('shows the run name', () => {
    render(<ReopenConfirm runName="Yorkshire" submitting={false} onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('Reopen Yorkshire?')).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    render(<ReopenConfirm runName="Yorkshire" submitting={false} onCancel={onCancel} onConfirm={() => {}} />);

    await userEvent.click(screen.getByText('Cancel'));

    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm when Reopen is clicked', async () => {
    const onConfirm = vi.fn();
    render(<ReopenConfirm runName="Yorkshire" submitting={false} onCancel={() => {}} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByText('Reopen'));

    expect(onConfirm).toHaveBeenCalled();
  });

  it('disables both buttons and shows submitting state', () => {
    render(<ReopenConfirm runName="Yorkshire" submitting onCancel={() => {}} onConfirm={() => {}} />);

    expect(screen.getByText('Cancel')).toBeDisabled();
    expect(screen.getByText('Reopening…')).toBeDisabled();
  });
});
