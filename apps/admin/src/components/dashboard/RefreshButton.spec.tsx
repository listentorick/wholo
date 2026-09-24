import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RefreshButton } from './RefreshButton';

describe('RefreshButton', () => {
  it('refreshes when clicked', async () => {
    const onClick = vi.fn();
    render(<RefreshButton onClick={onClick} isRefreshing={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(onClick).toHaveBeenCalled();
  });

  it('is disabled while a refresh is in flight', () => {
    render(<RefreshButton onClick={vi.fn()} isRefreshing={true} />);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });
});
