import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCursorList } from './use-cursor-list';

interface Item {
  id: string;
}

function makePage(items: Item[], overrides: Partial<{ nextCursor: string | null; hasMore: boolean; total: number }> = {}) {
  return {
    data: items,
    pagination: {
      nextCursor: overrides.nextCursor ?? null,
      hasMore: overrides.hasMore ?? false,
      total: overrides.total ?? items.length,
    },
  };
}

describe('useCursorList', () => {
  it('loads the first page on mount and exposes total/hasMore', async () => {
    const fetchPage = vi.fn().mockResolvedValue(
      makePage([{ id: '1' }, { id: '2' }], { nextCursor: 'c1', hasMore: true, total: 5 }),
    );

    const { result } = renderHook(() =>
      useCursorList({
        token: 'token-1',
        fetchPage,
        buildParams: (cursor) => ({ limit: 20, cursor }),
        errorMessage: 'Failed to load.',
        deps: [],
      }),
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([{ id: '1' }, { id: '2' }]);
    expect(result.current.total).toBe(5);
    expect(result.current.hasMore).toBe(true);
    expect(fetchPage).toHaveBeenCalledWith('token-1', { limit: 20, cursor: undefined });
  });

  it('appends results and passes the returned cursor back into buildParams on loadMore', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(makePage([{ id: '1' }], { nextCursor: 'c1', hasMore: true, total: 2 }))
      .mockResolvedValueOnce(makePage([{ id: '2' }], { nextCursor: null, hasMore: false, total: 2 }));

    const { result } = renderHook(() =>
      useCursorList({
        token: 'token-1',
        fetchPage,
        buildParams: (cursor) => ({ limit: 1, cursor }),
        errorMessage: 'Failed to load.',
        deps: [],
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([{ id: '1' }]);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(fetchPage).toHaveBeenLastCalledWith('token-1', { limit: 1, cursor: 'c1' });
    expect(result.current.data).toEqual([{ id: '1' }, { id: '2' }]);
    expect(result.current.hasMore).toBe(false);
  });

  it('sets error to errorMessage when fetchPage rejects', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useCursorList({
        token: 'token-1',
        fetchPage,
        buildParams: (cursor) => ({ limit: 20, cursor }),
        errorMessage: 'Failed to load products. Please refresh.',
        deps: [],
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Failed to load products. Please refresh.');
    expect(result.current.data).toEqual([]);
  });

  it('triggers a fresh, non-appending reload when a dep changes', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(makePage([{ id: '1' }], { nextCursor: 'c1', hasMore: true, total: 1 }))
      .mockResolvedValueOnce(makePage([{ id: '2' }], { nextCursor: null, hasMore: false, total: 1 }));

    const { result, rerender } = renderHook(
      ({ status }: { status: string }) =>
        useCursorList({
          token: 'token-1',
          fetchPage,
          buildParams: (cursor) => ({ limit: 20, cursor, status }),
          errorMessage: 'Failed to load.',
          deps: [status],
        }),
      { initialProps: { status: 'ACTIVE' } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([{ id: '1' }]);

    rerender({ status: 'ARCHIVED' });

    // Fresh load, not appended — replaces rather than concatenates.
    await waitFor(() => expect(result.current.data).toEqual([{ id: '2' }]));
    expect(fetchPage).toHaveBeenLastCalledWith('token-1', { limit: 20, cursor: undefined, status: 'ARCHIVED' });
  });
});
