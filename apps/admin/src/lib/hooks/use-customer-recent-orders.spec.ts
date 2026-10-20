import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCustomerRecentOrders } from './use-customer-recent-orders';

const mockList = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({ adminOrdersApi: { listOrders: (...a: unknown[]) => mockList(...a) } }));

const page = (ids: string[]) => ({ data: ids.map((id) => ({ id })), pagination: { nextCursor: null, hasMore: false, total: ids.length } });

describe('useCustomerRecentOrders', () => {
  beforeEach(() => mockList.mockReset());

  it('makes no request while disabled', () => {
    renderHook(() => useCustomerRecentOrders('cust-1', 6, false));
    expect(mockList).not.toHaveBeenCalled();
  });

  it("asks for this customer's newest orders only", async () => {
    mockList.mockResolvedValue(page(['o-1', 'o-2']));
    const { result } = renderHook(() => useCustomerRecentOrders('cust-1', 6, true));

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(mockList).toHaveBeenCalledWith({ customerId: 'cust-1', limit: 6, sortBy: 'createdAt', sortOrder: 'desc' });
  });

  it('keeps the last good list and reports an error when a refresh fails', async () => {
    mockList.mockResolvedValueOnce(page(['o-1'])).mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useCustomerRecentOrders('cust-1', 6, true));
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    act(() => result.current.refetch());

    await waitFor(() => expect(result.current.error).toMatch(/could not load/i));
    expect(result.current.data).toHaveLength(1);
  });
});
