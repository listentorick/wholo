'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PaginatedResponse } from '@wholo/types';

interface UseCursorListOptions<T, TParams extends { limit?: number; cursor?: string }> {
  token: string | null | undefined;
  fetchPage: (token: string, params: TParams) => Promise<PaginatedResponse<T>>;
  buildParams: (cursor: string | undefined) => TParams;
  errorMessage: string;
  // Extra reload triggers beyond `token` — e.g. [filters, sortBy, sortOrder].
  // Any change here resets the cursor and replaces `data` rather than appending.
  deps: React.DependencyList;
}

interface UseCursorListResult<T> {
  data: T[];
  setData: React.Dispatch<React.SetStateAction<T[]>>;
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
}

export function useCursorList<T, TParams extends { limit?: number; cursor?: string }>({
  token,
  fetchPage,
  buildParams,
  errorMessage,
  deps,
}: UseCursorListOptions<T, TParams>): UseCursorListResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // fetchPage/buildParams are typically recreated every render (inline
  // closures at the call site) — ref'd so they don't force the load effect
  // to re-run on every render, only on genuine `deps` changes.
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;
  const buildParamsRef = useRef(buildParams);
  buildParamsRef.current = buildParams;

  const load = useCallback(
    async (activeToken: string, nextCursor: string | undefined, append: boolean) => {
      try {
        const params = buildParamsRef.current(nextCursor);
        const result = await fetchPageRef.current(activeToken, params);
        setData((prev) => (append ? [...prev, ...result.data] : result.data));
        setCursor(result.pagination.nextCursor ?? undefined);
        setHasMore(result.pagination.hasMore);
        setTotal(result.pagination.total);
        setError(null);
      } catch {
        setError(errorMessage);
      }
    },
    [errorMessage],
  );

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    load(token, undefined, false).finally(() => setIsLoading(false));
    // `deps` lets callers (e.g. Orders' filters/sort) trigger a fresh,
    // non-appending reload — spread is intentional, see UseCursorListOptions.deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, load, ...deps]);

  const loadMore = useCallback(async () => {
    if (!token || !cursor) return;
    setIsLoadingMore(true);
    await load(token, cursor, true);
    setIsLoadingMore(false);
  }, [token, cursor, load]);

  return { data, setData, total, isLoading, isLoadingMore, hasMore, error, loadMore };
}
