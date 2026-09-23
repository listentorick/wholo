import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttentionTiles } from './AttentionTiles';
import { overviewFixture } from './fixtures';

const { counts, generatedAt } = overviewFixture();

describe('AttentionTiles', () => {
  it('shows what needs attention, with how long the oldest order has waited', () => {
    render(<AttentionTiles counts={counts} generatedAt={generatedAt} active="ALL" onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: /to accept/i })).toHaveTextContent('4');
    expect(screen.getByRole('button', { name: /to accept/i })).toHaveTextContent('Oldest waiting 2h 10m');
    expect(screen.getByRole('button', { name: /not on a run/i })).toHaveTextContent('12');
    expect(screen.getByRole('button', { name: /overdue/i })).toHaveTextContent('5');
    expect(screen.getByRole('button', { name: /failed deliveries/i })).toHaveTextContent('3');
  });

  it('turns a zero into "All clear" so a quiet day reads as good news', () => {
    const quiet = { ...counts, overdue: { count: 0 }, failedLast24h: { count: 0 } };
    render(<AttentionTiles counts={quiet} generatedAt={generatedAt} active="ALL" onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: /overdue/i })).toHaveTextContent('All clear');
    expect(screen.getByRole('button', { name: /failed deliveries/i })).toHaveTextContent('All clear');
    expect(screen.getByRole('button', { name: /to accept/i })).not.toHaveTextContent('All clear');
  });

  it('copes with nothing waiting to be accepted having no oldest time', () => {
    render(<AttentionTiles counts={{ ...counts, toAccept: { count: 2, oldestSubmittedAt: null } }} generatedAt={generatedAt} active="ALL" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /to accept/i })).toHaveTextContent('Waiting for you');
  });

  it('filters the list below to a tile when it is clicked', async () => {
    const onSelect = vi.fn();
    render(<AttentionTiles counts={counts} generatedAt={generatedAt} active="ALL" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /overdue/i }));

    expect(onSelect).toHaveBeenCalledWith('OVERDUE');
  });

  it('clears the filter when the selected tile is clicked again', async () => {
    const onSelect = vi.fn();
    render(<AttentionTiles counts={counts} generatedAt={generatedAt} active="OVERDUE" onSelect={onSelect} />);

    expect(screen.getByRole('button', { name: /overdue/i })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /overdue/i }));

    expect(onSelect).toHaveBeenCalledWith('ALL');
  });
});
