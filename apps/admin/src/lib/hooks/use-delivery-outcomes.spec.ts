import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { DeliveryOutcomesResponse } from '@wholo/types';
import { useDeliveryOutcomes } from './use-delivery-outcomes';

const mockOutcomes = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({ adminDeliveryOverviewApi: { outcomes: (...a: unknown[]) => mockOutcomes(...a) } }));

const series = (from: string, to: string): DeliveryOutcomesResponse => ({ distributorId: 'd', from, to, timezone: 'UTC', days: [] });

describe('useDeliveryOutcomes', () => {
  beforeEach(() => mockOutcomes.mockReset());

  it('waits until the window is known', () => {
    const { result } = renderHook(() => useDeliveryOutcomes(null));
    expect(mockOutcomes).not.toHaveBeenCalled();
    expect(result.current).toEqual({ data: null, isLoading: false, error: null });
  });

  it('loads the series for the window', async () => {
    mockOutcomes.mockResolvedValue(series('2026-09-11', '2026-09-17'));
    const { result } = renderHook(() => useDeliveryOutcomes({ from: '2026-09-11', to: '2026-09-17' }));

    await waitFor(() => expect(result.current.data?.from).toBe('2026-09-11'));
    expect(result.current.isLoading).toBe(false);
    expect(mockOutcomes.mock.calls[0].slice(0, 2)).toEqual(['2026-09-11', '2026-09-17']);
  });

  it('reports a failure of its own, without throwing', async () => {
    mockOutcomes.mockRejectedValueOnce(new Error('facts down'));
    const { result } = renderHook(() => useDeliveryOutcomes({ from: '2026-09-11', to: '2026-09-17' }));

    await waitFor(() => expect(result.current.error).toMatch(/could not load/i));
    expect(result.current.data).toBeNull();
  });

  it('loads again when the window moves (the day rolls over)', async () => {
    mockOutcomes.mockImplementation(async (from: string, to: string) => series(from, to));
    const { result, rerender } = renderHook(({ w }) => useDeliveryOutcomes(w), { initialProps: { w: { from: '2026-09-11', to: '2026-09-17' } } });
    await waitFor(() => expect(result.current.data?.to).toBe('2026-09-17'));

    rerender({ w: { from: '2026-09-12', to: '2026-09-18' } });

    await waitFor(() => expect(result.current.data?.to).toBe('2026-09-18'));
    expect(mockOutcomes).toHaveBeenCalledTimes(2);
  });

  it('does not reload just because the caller passed a fresh object for the same window', async () => {
    mockOutcomes.mockResolvedValue(series('2026-09-11', '2026-09-17'));
    const { result, rerender } = renderHook(() => useDeliveryOutcomes({ from: '2026-09-11', to: '2026-09-17' }));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    rerender();
    rerender();

    expect(mockOutcomes).toHaveBeenCalledTimes(1);
  });
});
