import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NeedsDoingTable } from './NeedsDoingTable';
import { overviewFixture } from './fixtures';

const overview = overviewFixture();
const desktopTable = () => screen.getByRole('table');

describe('NeedsDoingTable', () => {
  it('lists what needs doing, most urgent first, each with why it is here', () => {
    render(<NeedsDoingTable overview={overview} filter="ALL" onFilter={vi.fn()} />);

    const rows = within(desktopTable()).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[1].textContent)).toEqual(['Riverside Care Home', 'Baker & Co', 'The Green Grocer', 'Marlowe Hotel']);
    expect(within(rows[0]).getByText('Customer closed · 09:52')).toBeInTheDocument(); // 08:52Z, BST
    expect(within(rows[1]).getByText('Was due 15 Sep · not on a run')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Waiting 2h 10m')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Due today · not on a run')).toBeInTheDocument();
  });

  it('opens the order when a row is opened', () => {
    render(<NeedsDoingTable overview={overview} filter="ALL" onFilter={vi.fn()} />);
    expect(within(desktopTable()).getAllByRole('link', { name: 'Open order' })[0]).toHaveAttribute('href', '/orders/o-f1');
  });

  it('on a phone, expanding a card reveals the detail and the order link (the mobile card list, not a bespoke card)', async () => {
    render(<NeedsDoingTable overview={overview} filter="ALL" onFilter={vi.fn()} />);

    // The same text also sits in the (CSS-hidden but present) desktop table row, so scope to the card.
    const card = screen.getByRole('button', { name: /riverside care home/i }).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: /riverside care home/i }));

    expect(within(card).getByText('Customer closed · 09:52')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open order' })).toHaveAttribute('href', '/orders/o-f1');
  });

  it('shows the true total on each filter chip', () => {
    render(<NeedsDoingTable overview={overview} filter="ALL" onFilter={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^failed 3$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^not on a run 12$/i })).toBeInTheDocument();
  });

  it('shows only the chosen kind when filtered', () => {
    render(<NeedsDoingTable overview={overview} filter="OVERDUE" onFilter={vi.fn()} />);

    const rows = within(desktopTable()).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Baker & Co')).toBeInTheDocument();
  });

  it('reports a chip click, and clears the filter when the selected chip is clicked again', async () => {
    const onFilter = vi.fn();
    const { rerender } = render(<NeedsDoingTable overview={overview} filter="ALL" onFilter={onFilter} />);

    await userEvent.click(screen.getByRole('button', { name: /^overdue 5$/i }));
    expect(onFilter).toHaveBeenLastCalledWith('OVERDUE');

    rerender(<NeedsDoingTable overview={overview} filter="OVERDUE" onFilter={onFilter} />);
    await userEvent.click(screen.getByRole('button', { name: /^overdue 5$/i }));
    expect(onFilter).toHaveBeenLastCalledWith('ALL');
  });

  it('says how many are hidden by the per-kind cap, and only for the kinds that were capped', () => {
    render(<NeedsDoingTable overview={overview} filter="ALL" onFilter={vi.fn()} />);

    // 12 not on a run, 1 shown; 5 overdue, 1 shown; 4 to accept, 1 shown; 3 failed, 1 shown
    expect(screen.getByText(/showing 1 of 3 failed/i)).toBeInTheDocument();
    expect(screen.getByText(/showing 1 of 12 not on a run/i)).toBeInTheDocument();
  });

  it('shows no cap note when everything is on screen', () => {
    const complete = overviewFixture({ counts: { toAccept: { count: 1, oldestSubmittedAt: null }, overdue: { count: 1 }, notOnRun: { count: 1 }, failedLast24h: { count: 1 } } });
    render(<NeedsDoingTable overview={complete} filter="ALL" onFilter={vi.fn()} />);
    expect(screen.queryByText(/showing \d+ of/i)).not.toBeInTheDocument();
  });

  it('says nothing needs doing on a quiet day', () => {
    const quiet = overviewFixture({ queue: [], counts: { toAccept: { count: 0, oldestSubmittedAt: null }, overdue: { count: 0 }, notOnRun: { count: 0 }, failedLast24h: { count: 0 } } });
    render(<NeedsDoingTable overview={quiet} filter="ALL" onFilter={vi.fn()} />);

    expect(screen.getByText(/nothing needs doing right now/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('says so when the chosen filter has nothing in it', () => {
    render(<NeedsDoingTable overview={overviewFixture({ queue: overview.queue.filter((i) => i.kind !== 'FAILED') })} filter="FAILED" onFilter={vi.fn()} />);
    expect(screen.getByText(/nothing in “failed”/i)).toBeInTheDocument();
  });
});
