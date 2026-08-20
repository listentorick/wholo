import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryCardActions } from './DeliveryCardActions';

describe('DeliveryCardActions', () => {
  it('always renders the Move to… trigger', () => {
    render(<DeliveryCardActions currentRunId="run-1" runs={[]} suggestedRunId={null} onMove={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Move to…' })).toBeInTheDocument();
  });

  it('renders Move up/down only when onMoveUpDown is provided', () => {
    const { rerender } = render(
      <DeliveryCardActions currentRunId={null} runs={[]} suggestedRunId={null} onMove={vi.fn()} />,
    );
    expect(screen.queryByLabelText('Move up')).not.toBeInTheDocument();

    rerender(
      <DeliveryCardActions currentRunId="run-1" runs={[]} suggestedRunId={null} onMove={vi.fn()} onMoveUpDown={vi.fn()} />,
    );
    expect(screen.getByLabelText('Move up')).toBeInTheDocument();
  });

  it('disables everything when disabled is set', () => {
    render(
      <DeliveryCardActions currentRunId="run-1" runs={[]} suggestedRunId={null} disabled onMove={vi.fn()} onMoveUpDown={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Move to…' })).toBeDisabled();
    expect(screen.getByLabelText('Move up')).toBeDisabled();
    expect(screen.getByLabelText('Move down')).toBeDisabled();
  });

  it('calls onMoveUpDown with the direction', async () => {
    const onMoveUpDown = vi.fn();
    render(
      <DeliveryCardActions currentRunId="run-1" runs={[]} suggestedRunId={null} onMove={vi.fn()} onMoveUpDown={onMoveUpDown} />,
    );
    await userEvent.click(screen.getByLabelText('Move down'));
    expect(onMoveUpDown).toHaveBeenCalledWith('down');
  });
});
