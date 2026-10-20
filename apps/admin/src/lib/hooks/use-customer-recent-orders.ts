'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrderSummary } from '@wholo/types';
import { adminOrdersApi } from '@wholo/admin-api-client';

interface UseCustomerRecentOrdersResult {
  data: OrderSummary[] | null;
  isLoading: boolean; // the very first load only
  isRefreshing: boolean; // a later load: the previous data stays on screen
  error: string | null;
  refetch: () => void;
}

// A customer's most recent orders (newest first), from the same
// orders list the Orders page uses, filtered to this customer.
export function useCustomerRecentOrders(customerId: string, limit: number, enabled: boolean): UseCustomerRecentOrdersResult {
  const [data, setData] = useState<OrderSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    if (hasLoadedOnceRef.current) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    adminOrdersApi
      .listOrders({ customerId, limit, sortBy: 'createdAt', sortOrder: 'desc' })
      .then((result) => {
        if (!cancelled) setData(result.data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load recent orders.');
      })
      .finally(() => {
        if (cancelled) return;
        hasLoadedOnceRef.current = true;
        setIsLoading(false);
        setIsRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, limit, enabled, reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { data, isLoading, isRefreshing, error, refetch };
}
