import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { DeliveryDayBoard } from '@wholo/types';
import { useDeliveryDay } from './use-delivery-day';

const mockGetDay = vi.fn();

vi.mock('@wholo/admin-api-client', () => ({
  adminDeliveryRunsApi: {
    getDay: (...args: unknown[]) => mockGetDay(...args),
  },
}));

function makeBoard(date: string): DeliveryDayBoard {
  return { distributorId: 'dist-1', date, runs: [], unassigned: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useDeliveryDay', () => {
  beforeEach(() => {
    mockGetDay.mockReset();
  });

  it('discards a request #1 response that resolves after request #2 (stale-response guard)', async () => {
    const first = deferred<DeliveryDayBoard>();
    const second = deferred<DeliveryDayBoard>();
    mockGetDay.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ date }: { date: string }) => useDeliveryDay(true, date),
      { initialProps: { date: '2026-08-20' } },
    );

    rerender({ date: '2026-08-21' });
    expect(mockGetDay).toHaveBeenCalledTimes(2);

    // Resolve #2 first, then #1 — #1's result must never win.
    second.resolve(makeBoard('2026-08-21'));
    await waitFor(() => expect(result.current.board?.date).toBe('2026-08-21'));

    first.resolve(makeBoard('2026-08-20'));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.board?.date).toBe('2026-08-21');
  });

  it('sets isLoading only on the first load, isRefreshing on subsequent date changes', async () => {
    mockGetDay.mockResolvedValue(makeBoard('2026-08-20'));

    const { result, rerender } = renderHook(
      ({ date }: { date: string }) => useDeliveryDay(true, date),
      { initialProps: { date: '2026-08-20' } },
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    rerender({ date: '2026-08-21' });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(true);

    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
  });

  it('swallows AbortError without setting error', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    mockGetDay.mockRejectedValue(abortError);

    const { result } = renderHook(() => useDeliveryDay(true, '2026-08-20'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('sets error on a real failure', async () => {
    mockGetDay.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useDeliveryDay(true, '2026-08-20'));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.isLoading).toBe(false);
  });

  it('mutate() swaps the board synchronously with no network call', async () => {
    mockGetDay.mockResolvedValue(makeBoard('2026-08-20'));

    const { result } = renderHook(() => useDeliveryDay(true, '2026-08-20'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callsBefore = mockGetDay.mock.calls.length;
    const nextBoard = makeBoard('2026-08-20');
    act(() => result.current.mutate(nextBoard));

    await waitFor(() => expect(result.current.board).toBe(nextBoard));
    expect(mockGetDay.mock.calls.length).toBe(callsBefore);
  });
});
