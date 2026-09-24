import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { CustomerHealthResponse } from '@wholo/types';
import { useCustomerHealth } from './use-customer-health';

const mockGet = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({ adminCustomerHealthApi: { get: (...a: unknown[]) => mockGet(...a) } }));

const response = (generatedAt = '2026-09-24T12:00:00.000Z'): CustomerHealthResponse => ({
  distributorId: 'd',
  timezone: 'UTC',
  generatedAt,
  tiles: { activeCustomers90d: 1, atRiskCount: 0, salesLast30d: 0 },
  tierCounts: { healthy: 1, watch: 0, at_risk: 0 },
  needingAttention: [],
  buyingTrends: [],
  salesConcentration: { periodDays: 90, totalValue: 0, top5Share: null, topCustomers: [], otherValue: 0, otherShare: null },
});

describe('useCustomerHealth', () => {
  beforeEach(() => mockGet.mockReset());

  it('waits until auth is ready', () => {
    renderHook(() => useCustomerHealth(false));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('loads once on mount, without polling', async () => {
    mockGet.mockResolvedValue(response());
    const { result } = renderHook(() => useCustomerHealth(true));

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.isLoading).toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('reports a failure without throwing', async () => {
    mockGet.mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useCustomerHealth(true));

    await waitFor(() => expect(result.current.error).toMatch(/could not load/i));
    expect(result.current.data).toBeNull();
  });

  it('reloads on refetch, keeping the previous data on screen while it does', async () => {
    mockGet.mockResolvedValueOnce(response('2026-09-24T12:00:00.000Z')).mockResolvedValueOnce(response('2026-09-24T13:00:00.000Z'));
    const { result } = renderHook(() => useCustomerHealth(true));
    await waitFor(() => expect(result.current.data?.generatedAt).toBe('2026-09-24T12:00:00.000Z'));

    act(() => result.current.refetch());

    expect(result.current.data?.generatedAt).toBe('2026-09-24T12:00:00.000Z');
    await waitFor(() => expect(result.current.data?.generatedAt).toBe('2026-09-24T13:00:00.000Z'));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good data and reports an error when a refresh fails', async () => {
    mockGet.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useCustomerHealth(true));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    act(() => result.current.refetch());

    await waitFor(() => expect(result.current.error).toMatch(/could not load/i));
    expect(result.current.data).not.toBeNull();
  });
});
