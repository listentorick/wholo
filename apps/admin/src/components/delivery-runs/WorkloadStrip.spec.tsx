import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkloadStrip } from './WorkloadStrip';

const mockListDays = vi.fn();

vi.mock('@wholo/admin-api-client', () => ({
  adminDeliveryRunsApi: {
    listDays: (...args: unknown[]) => mockListDays(...args),
  },
}));

function makeDays(from: string) {
  const start = new Date(`${from}T00:00:00.000Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), runCount: 1, stopCount: i, unassignedCount: 0 };
  });
}

const WEEK_START = new Date(2026, 7, 17); // Monday, matches selectedDate="2026-08-19" below

describe('WorkloadStrip', () => {
  beforeEach(() => {
    mockListDays.mockReset();
  });

  it('fetches a 7-day window anchored to weekStart and renders each day\'s count', async () => {
    mockListDays.mockResolvedValue({ data: makeDays('2026-08-17') });

    render(
      <WorkloadStrip
        token="token-1"
        selectedDate="2026-08-19"
        onSelectDate={vi.fn()}
        weekStart={WEEK_START}
        onWeekStartChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(mockListDays).toHaveBeenCalled());
    const [, params] = mockListDays.mock.calls[0];
    expect(params).toEqual({ from: '2026-08-17', to: '2026-08-23' });

    await waitFor(() => expect(screen.getAllByText(/^[0-6]$/).length).toBeGreaterThan(0));
  });

  it('calls onSelectDate when a day is clicked', async () => {
    mockListDays.mockResolvedValue({ data: makeDays('2026-08-17') });
    const onSelectDate = vi.fn();

    render(
      <WorkloadStrip
        token="token-1"
        selectedDate="2026-08-19"
        onSelectDate={onSelectDate}
        weekStart={WEEK_START}
        onWeekStartChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(mockListDays).toHaveBeenCalled());
    const buttons = await screen.findAllByRole('button');
    // First and last buttons are the prev/next week arrows.
    await userEvent.click(buttons[1]);
    expect(onSelectDate).toHaveBeenCalledWith('2026-08-17');
  });

  it('calls onWeekStartChange with the next week when the next-week arrow is clicked', async () => {
    mockListDays.mockResolvedValue({ data: makeDays('2026-08-17') });
    const onWeekStartChange = vi.fn();

    render(
      <WorkloadStrip
        token="token-1"
        selectedDate="2026-08-19"
        onSelectDate={vi.fn()}
        weekStart={WEEK_START}
        onWeekStartChange={onWeekStartChange}
      />,
    );
    await waitFor(() => expect(mockListDays).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByLabelText('Next week'));

    expect(onWeekStartChange).toHaveBeenCalledTimes(1);
    expect(onWeekStartChange.mock.calls[0][0].getTime()).toBe(new Date(2026, 7, 24).getTime());
  });

  it('calls onWeekStartChange with the previous week when the previous-week arrow is clicked', async () => {
    mockListDays.mockResolvedValue({ data: makeDays('2026-08-17') });
    const onWeekStartChange = vi.fn();

    render(
      <WorkloadStrip
        token="token-1"
        selectedDate="2026-08-19"
        onSelectDate={vi.fn()}
        weekStart={WEEK_START}
        onWeekStartChange={onWeekStartChange}
      />,
    );
    await waitFor(() => expect(mockListDays).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByLabelText('Previous week'));

    expect(onWeekStartChange).toHaveBeenCalledTimes(1);
    expect(onWeekStartChange.mock.calls[0][0].getTime()).toBe(new Date(2026, 7, 10).getTime());
  });

  it('re-fetches when the parent updates the weekStart prop', async () => {
    mockListDays.mockResolvedValue({ data: makeDays('2026-08-17') });

    const { rerender } = render(
      <WorkloadStrip
        token="token-1"
        selectedDate="2026-08-19"
        onSelectDate={vi.fn()}
        weekStart={WEEK_START}
        onWeekStartChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(mockListDays).toHaveBeenCalledTimes(1));

    rerender(
      <WorkloadStrip
        token="token-1"
        selectedDate="2026-08-19"
        onSelectDate={vi.fn()}
        weekStart={new Date(2026, 7, 24)}
        onWeekStartChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(mockListDays).toHaveBeenCalledTimes(2));
    const [, params] = mockListDays.mock.calls[1];
    expect(params).toEqual({ from: '2026-08-24', to: '2026-08-30' });
  });

  it('shows an inline error message instead of throwing when listDays rejects', async () => {
    mockListDays.mockRejectedValue(new Error('boom'));

    render(
      <WorkloadStrip
        token="token-1"
        selectedDate="2026-08-19"
        onSelectDate={vi.fn()}
        weekStart={WEEK_START}
        onWeekStartChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('Failed to load the workload strip.')).toBeInTheDocument());
  });

  it('re-fetches the same week when refreshKey changes — e.g. after a cross-day reschedule elsewhere', async () => {
    mockListDays.mockResolvedValue({ data: makeDays('2026-08-17') });

    const { rerender } = render(
      <WorkloadStrip
        token="token-1"
        selectedDate="2026-08-19"
        onSelectDate={vi.fn()}
        weekStart={WEEK_START}
        onWeekStartChange={vi.fn()}
        refreshKey={0}
      />,
    );
    await waitFor(() => expect(mockListDays).toHaveBeenCalledTimes(1));

    rerender(
      <WorkloadStrip
        token="token-1"
        selectedDate="2026-08-19"
        onSelectDate={vi.fn()}
        weekStart={WEEK_START}
        onWeekStartChange={vi.fn()}
        refreshKey={1}
      />,
    );

    await waitFor(() => expect(mockListDays).toHaveBeenCalledTimes(2));
    const [, params] = mockListDays.mock.calls[1];
    expect(params).toEqual({ from: '2026-08-17', to: '2026-08-23' });
  });
});
