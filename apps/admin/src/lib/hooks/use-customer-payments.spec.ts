import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { CustomerPaymentSummary } from '@wholo/types';
import { useCustomerPayments } from './use-customer-payments';

const mockGet = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({ adminCustomerPaymentsApi: { get: (...a: unknown[]) => mockGet(...a) } }));

const response = (asOf = '2026-10-17') => ({ customerId: 'cust-1', asOf }) as unknown as CustomerPaymentSummary;

describe('useCustomerPayments', () => {
  beforeEach(() => mockGet.mockReset());

  it('makes no request while disabled', () => {
    renderHook(() => useCustomerPayments('cust-1', false));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("loads the customer's figures once on mount", async () => {
    mockGet.mockResolvedValue(response());
    const { result } = renderHook(() => useCustomerPayments('cust-1', true));

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.isLoading).toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][0]).toBe('cust-1');
  });

  it('reports a failure without throwing', async () => {
    mockGet.mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useCustomerPayments('cust-1', true));

    await waitFor(() => expect(result.current.error).toMatch(/could not load/i));
    expect(result.current.data).toBeNull();
  });

  it('reloads on refetch, keeping the previous data on screen while it does', async () => {
    mockGet.mockResolvedValueOnce(response('2026-10-16')).mockResolvedValueOnce(response('2026-10-17'));
    const { result } = renderHook(() => useCustomerPayments('cust-1', true));
    await waitFor(() => expect(result.current.data?.asOf).toBe('2026-10-16'));

    act(() => result.current.refetch());

    expect(result.current.data?.asOf).toBe('2026-10-16');
    await waitFor(() => expect(result.current.data?.asOf).toBe('2026-10-17'));
  });

  it('keeps the last good data and reports an error when a refresh fails', async () => {
    mockGet.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useCustomerPayments('cust-1', true));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    act(() => result.current.refetch());

    await waitFor(() => expect(result.current.error).toMatch(/could not load/i));
    expect(result.current.data).not.toBeNull();
  });
});
