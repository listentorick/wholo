'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DeliveryDayBoard } from '@wholo/types';
import { adminDeliveryRunsApi } from '@wholo/admin-api-client';

interface UseDeliveryDayResult {
  board: DeliveryDayBoard | null;
  isLoading: boolean;      // true only on the very first load for a given date
  isRefreshing: boolean;   // true on subsequent loads (date nav); previous board stays visible, dimmed
  error: string | null;
  refetch: () => Promise<void>;
  // Swap in a board a mutation already returned — no round trip.
  mutate: (board: DeliveryDayBoard) => void;
}

// Purpose-built rather than useCursorList: that hook is cursor+append
// shaped with no refetch()/AbortController/staleness guard. This board is a
// single keyed-entity load (one date → one board object), and date
// navigation needs a request-id guard so a slow response for an earlier
// date can never clobber a later one that resolved first
// (today → next → next painting stale).
// `enabled` holds the load until auth is ready; the bearer itself comes from
// the centralised token provider in the api-client, never threaded here.
export function useDeliveryDay(enabled: boolean, date: string): UseDeliveryDayResult {
  const [board, setBoard] = useState<DeliveryDayBoard | null>(null);
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
      const result = await adminDeliveryRunsApi.getDay(date, controller.signal);
      if (requestIdRef.current !== myId) return; // stale-response guard
      setBoard(result);
      setError(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (requestIdRef.current !== myId) return;
      setError('Failed to load the delivery board. Please refresh.');
    } finally {
      if (requestIdRef.current === myId) {
        hasLoadedOnceRef.current = true;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [enabled, date]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const mutate = useCallback((next: DeliveryDayBoard) => setBoard(next), []);

  return { board, isLoading, isRefreshing, error, refetch: load, mutate };
}
