import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { DeliveryOverview } from '@wholo/types';
import { OVERVIEW_POLL_MS, useDeliveryOverview } from './use-delivery-overview';

const mockGet = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({ adminDeliveryOverviewApi: { get: (...a: unknown[]) => mockGet(...a) } }));

const snapshot = (generatedAt: string): DeliveryOverview => ({
  distributorId: 'd', date: '2026-09-18', timezone: 'UTC', generatedAt,
  counts: { toAccept: { count: 0, oldestSubmittedAt: null }, overdue: { count: 0 }, notOnRun: { count: 0 }, failedLast24h: { count: 0 } },
  progress: { planned: 0, delivered: 0, failed: 0, remaining: 0 }, runs: [], queue: [], queueCap: 10,
});
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('useDeliveryOverview', () => {
  beforeEach(() => mockGet.mockReset());
  afterEach(() => vi.useRealTimers());

  it('loads the snapshot once enabled', async () => {
    mockGet.mockResolvedValue(snapshot('t1'));
    const { result } = renderHook(() => useDeliveryOverview(true));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.overview?.generatedAt).toBe('t1'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not load until it is enabled', () => {
    renderHook(() => useDeliveryOverview(false));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('reports a first-load failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useDeliveryOverview(true));

    await waitFor(() => expect(result.current.error).toMatch(/could not load/i));
    expect(result.current.overview).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps the last good snapshot on screen when a refresh fails, and recovers on the next one', async () => {
    mockGet.mockResolvedValueOnce(snapshot('t1')).mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce(snapshot('t3'));
    const { result } = renderHook(() => useDeliveryOverview(true));
    await waitFor(() => expect(result.current.overview?.generatedAt).toBe('t1'));

    await act(async () => { await result.current.refetch(); });
    expect(result.current.overview?.generatedAt).toBe('t1'); // still showing the last good one
    expect(result.current.error).not.toBeNull();

    await act(async () => { await result.current.refetch(); });
    expect(result.current.overview?.generatedAt).toBe('t3');
    expect(result.current.error).toBeNull();
  });

  it('discards a slow response that arrives after a newer one (stale-response guard)', async () => {
    const first = deferred<DeliveryOverview>();
    const second = deferred<DeliveryOverview>();
    mockGet.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useDeliveryOverview(true));

    act(() => { void result.current.refetch(); });
    await act(async () => { second.resolve(snapshot('newer')); });
    await act(async () => { first.resolve(snapshot('older')); });

    await waitFor(() => expect(result.current.overview?.generatedAt).toBe('newer'));
  });

  it('refreshes itself every minute while the page is visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValue(snapshot('t'));
    renderHook(() => useDeliveryOverview(true));
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    await act(async () => { vi.advanceTimersByTime(OVERVIEW_POLL_MS); });
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    await act(async () => { vi.advanceTimersByTime(OVERVIEW_POLL_MS); });
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3));
  });

  it('does not poll while the page is hidden, and catches up as soon as it is shown again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValue(snapshot('t'));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    renderHook(() => useDeliveryOverview(true));
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    await act(async () => { vi.advanceTimersByTime(OVERVIEW_POLL_MS * 3); });
    expect(mockGet).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    visibility.mockRestore();
  });

  it('stops polling when unmounted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValue(snapshot('t'));
    const { unmount } = renderHook(() => useDeliveryOverview(true));
    await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => { vi.advanceTimersByTime(OVERVIEW_POLL_MS * 2); });

    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
