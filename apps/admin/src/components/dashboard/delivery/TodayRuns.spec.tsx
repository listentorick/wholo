import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TodayRuns } from './TodayRuns';
import { overviewFixture } from './fixtures';

const { runs } = overviewFixture();

describe('TodayRuns', () => {
  it("shows each run with its driver, how far through it is, and the time of the last drop in the distributor's timezone", () => {
    render(<TodayRuns runs={runs} timezone="Europe/London" />);

    const r1 = screen.getByText('R1 North').closest('li')!;
    expect(within(r1).getByText('Dan Whitmore')).toBeInTheDocument();
    expect(within(r1).getByText('Delivering')).toBeInTheDocument();
    expect(within(r1).getByText('Last drop 12:09')).toBeInTheDocument(); // 11:09Z is 12:09 BST
    expect(within(r1).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '83');
  });

  it('says a run that has not started, and has no driver, is exactly that', () => {
    render(<TodayRuns runs={runs} timezone="Europe/London" />);

    const r4 = screen.getByText('R4 West').closest('li')!;
    expect(within(r4).getByText('No driver yet')).toBeInTheDocument();
    expect(within(r4).getByText('Open')).toBeInTheDocument();
    expect(within(r4).getByText('Not ready yet')).toBeInTheDocument();
  });

  it('links to the full runs board', () => {
    render(<TodayRuns runs={runs} timezone="UTC" />);
    expect(screen.getByRole('link', { name: /view all runs/i })).toHaveAttribute('href', '/delivery-runs');
  });

  it('shows a message rather than an empty panel when no runs are planned', () => {
    render(<TodayRuns runs={[]} timezone="UTC" />);
    expect(screen.getByText(/no runs planned for today/i)).toBeInTheDocument();
  });

  it('does not divide by zero for an empty run', () => {
    render(<TodayRuns runs={[{ runId: 'r', name: 'Empty', driverName: null, status: 'OPEN', stopCount: 0, attemptedCount: 0, lastDropAt: null }]} timezone="UTC" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});
