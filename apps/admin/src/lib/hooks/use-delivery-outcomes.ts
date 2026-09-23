'use client';

import { useEffect, useState } from 'react';
import type { DeliveryOutcomesResponse } from '@wholo/types';
import { adminDeliveryOverviewApi } from '@wholo/admin-api-client';

interface UseDeliveryOutcomesResult {
  data: DeliveryOutcomesResponse | null;
  isLoading: boolean;
  error: string | null;
}

// History for the trend chart. Loaded independently of the live snapshot — its
// own loading and error state — so a slow or failing facts query never blanks
// the tiles. Completed days barely change, so there is no polling. Pass null
// until the window is known (it depends on the distributor's "today").
export function useDeliveryOutcomes(window: { from: string; to: string } | null): UseDeliveryOutcomesResult {
  const from = window?.from ?? null;
  const to = window?.to ?? null;
  const [data, setData] = useState<DeliveryOutcomesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!from || !to) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    adminDeliveryOverviewApi
      .outcomes(from, to, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
        setError('Could not load the last seven days.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [from, to]);

  return { data, isLoading, error };
}
