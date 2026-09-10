import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMyDistributors = vi.fn();
vi.mock('@wholo/api-client', () => ({ portalApi: { getMyDistributors: () => getMyDistributors() } }));

let mockAuth: { user: unknown; accessToken: string | null; orderAsMode: boolean };
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockAuth }));

import { useViewerOrderCount } from './use-viewer-order-count';

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = { user: { id: 'u1' }, accessToken: 'tok', orderAsMode: false };
});

describe('useViewerOrderCount', () => {
  it('returns the order count for the matching distributor slug', async () => {
    getMyDistributors.mockResolvedValue([
      { slug: 'other', orderCount: 2 },
      { slug: 'winos', orderCount: 7 },
    ]);
    const { result } = renderHook(() => useViewerOrderCount('winos'));
    await waitFor(() => expect(result.current).toBe(7));
  });

  it('returns null when the customer has no relationship with that distributor', async () => {
    getMyDistributors.mockResolvedValue([{ slug: 'other', orderCount: 2 }]);
    const { result } = renderHook(() => useViewerOrderCount('winos'));
    await waitFor(() => expect(getMyDistributors).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('returns null on error', async () => {
    getMyDistributors.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useViewerOrderCount('winos'));
    await waitFor(() => expect(getMyDistributors).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('does not fetch when signed out', () => {
    mockAuth = { user: null, accessToken: null, orderAsMode: false };
    renderHook(() => useViewerOrderCount('winos'));
    expect(getMyDistributors).not.toHaveBeenCalled();
  });
});
