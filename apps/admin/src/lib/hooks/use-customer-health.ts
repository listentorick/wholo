'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CustomerHealthResponse } from '@wholo/types';
import { adminCustomerHealthApi } from '@wholo/admin-api-client';

interface UseCustomerHealthResult {
  data: CustomerHealthResponse | null;
  isLoading: boolean; // the very first load only
  isRefreshing: boolean; // a later load: the previous data stays on screen
  error: string | null;
  refetch: () => void;
}

// The Customers dashboard's health read. Fetched once on mount and again only
// on manual refresh — unlike the Delivery dashboard's live snapshot, none of
// the six signals here is a minute-to-minute read, so there is no polling.
export function useCustomerHealth(enabled: boolean): UseCustomerHealthResult {
  const [data, setData] = useState<CustomerHealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    if (hasLoadedOnceRef.current) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    adminCustomerHealthApi
      .get(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
      })
      .catch((e) => {
        if (controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
        setError('Could not load customer health.');
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        hasLoadedOnceRef.current = true;
        setIsLoading(false);
        setIsRefreshing(false);
      });

    return () => controller.abort();
  }, [enabled, reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { data, isLoading, isRefreshing, error, refetch };
}
