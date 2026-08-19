import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardViewToggle } from './BoardViewToggle';

describe('BoardViewToggle', () => {
  it('marks the current mode as pressed', () => {
    render(<BoardViewToggle mode="board" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked mode', async () => {
    const onChange = vi.fn();
    render(<BoardViewToggle mode="board" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });
});
