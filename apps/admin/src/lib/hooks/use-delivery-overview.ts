'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeliveryOverview } from '@wholo/types';
import { adminDeliveryOverviewApi } from '@wholo/admin-api-client';

export const OVERVIEW_POLL_MS = 60_000;

interface UseDeliveryOverviewResult {
  overview: DeliveryOverview | null;
  isLoading: boolean; // the very first load only
  isRefreshing: boolean; // a later load: the previous snapshot stays on screen
  error: string | null;
  refetch: () => Promise<void>;
}

// The Delivery dashboard's live snapshot. Refreshes itself every minute while the
// page is visible (and straight away when it becomes visible again), so a
// screen left up on a warehouse wall does not go stale. A failed refresh keeps
// the last good snapshot on screen and reports the error alongside it.
// `enabled` holds the load until auth is ready; the stale-response guard means
// a slow earlier request can never overwrite a newer one.
export function useDeliveryOverview(enabled: boolean): UseDeliveryOverviewResult {
  const [overview, setOverview] = useState<DeliveryOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    const myId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (hasLoadedOnceRef.current) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const result = await adminDeliveryOverviewApi.get(controller.signal);
      if (requestIdRef.current !== myId) return;
      setOverview(result);
      setError(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (requestIdRef.current !== myId) return;
      setError('Could not load today’s deliveries.');
    } finally {
      if (requestIdRef.current === myId) {
        hasLoadedOnceRef.current = true;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = setInterval(tick, OVERVIEW_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [enabled, load]);

  return { overview, isLoading, isRefreshing, error, refetch: load };
}
