'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PaginatedResponse } from '@wholo/types';

interface UseCursorListOptions<T, TParams extends { limit?: number; cursor?: string }> {
  // Hold the query until auth (or anything else the caller needs) is ready.
  // Defaults to true. The bearer itself is supplied by the centralised token
  // provider inside the api-client — hooks never thread a token.
  enabled?: boolean;
  fetchPage: (params: TParams) => Promise<PaginatedResponse<T>>;
  buildParams: (cursor: string | undefined) => TParams;
  errorMessage: string;
  // Extra reload triggers beyond `enabled` — e.g. [filters, sortBy, sortOrder].
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
  enabled = true,
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
    async (nextCursor: string | undefined, append: boolean) => {
      try {
        const params = buildParamsRef.current(nextCursor);
        const result = await fetchPageRef.current(params);
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
    if (!enabled) return;
    setIsLoading(true);
    load(undefined, false).finally(() => setIsLoading(false));
    // `deps` lets callers (e.g. Orders' filters/sort) trigger a fresh,
    // non-appending reload — spread is intentional, see UseCursorListOptions.deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, load, ...deps]);

  const loadMore = useCallback(async () => {
    if (!enabled || !cursor) return;
    setIsLoadingMore(true);
    await load(cursor, true);
    setIsLoadingMore(false);
  }, [enabled, cursor, load]);

  return { data, setData, total, isLoading, isLoadingMore, hasMore, error, loadMore };
}
