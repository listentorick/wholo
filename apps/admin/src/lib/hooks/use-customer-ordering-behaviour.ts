'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CustomerOrderingBehaviour } from '@wholo/types';
import { adminCustomerOrderingApi } from '@wholo/admin-api-client';

interface UseCustomerOrderingBehaviourResult {
  data: CustomerOrderingBehaviour | null;
  isLoading: boolean; // the very first load only
  isRefreshing: boolean; // a later load: the previous data stays on screen
  error: string | null;
  refetch: () => void;
}

// The customer dashboard's ordering read (recency, frequency, spend, product
// breadth). Sales figures: pass enabled=false for users without
// analytics:read, so the request is never made. Refreshed manually only.
export function useCustomerOrderingBehaviour(customerId: string, enabled: boolean): UseCustomerOrderingBehaviourResult {
  const [data, setData] = useState<CustomerOrderingBehaviour | null>(null);
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

    adminCustomerOrderingApi
      .get(customerId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
      })
      .catch((e) => {
        if (controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
        setError('Could not load ordering behaviour.');
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        hasLoadedOnceRef.current = true;
        setIsLoading(false);
        setIsRefreshing(false);
      });

    return () => controller.abort();
  }, [customerId, enabled, reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { data, isLoading, isRefreshing, error, refetch };
}
