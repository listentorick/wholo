'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CustomerPaymentSummary } from '@wholo/types';
import { adminCustomerPaymentsApi } from '@wholo/admin-api-client';

interface UseCustomerPaymentsResult {
  data: CustomerPaymentSummary | null;
  isLoading: boolean; // the very first load only
  isRefreshing: boolean; // a later load: the previous data stays on screen
  error: string | null;
  refetch: () => void;
}

// The customer dashboard's money read: what is owed and overdue right now,
// credit used, how promptly they pay, and when invoices last synced. Fetched
// on mount and again only on manual refresh, like the other dashboards.
export function useCustomerPayments(customerId: string, enabled: boolean): UseCustomerPaymentsResult {
  const [data, setData] = useState<CustomerPaymentSummary | null>(null);
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

    adminCustomerPaymentsApi
      .get(customerId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
      })
      .catch((e) => {
        if (controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
        setError('Could not load payments.');
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
