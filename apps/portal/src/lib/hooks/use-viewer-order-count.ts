'use client';

import { useEffect, useState } from 'react';
import { portalApi } from '@wholo/api-client';
import { useAuth } from '@/lib/auth-context';

/**
 * The signed-in customer's own order count with one distributor, for the
 * "{N} orders with this supplier" line on the storefront header.
 *
 * `DistributorInfo` doesn't carry this (its `customerCount` is the supplier's
 * total active customers), so we pull the customer's distributor summaries and
 * match by slug. Returns `null` — line hidden — before load, on error, or when
 * the customer has no relationship with this distributor.
 */
export function useViewerOrderCount(distributorSlug: string): number | null {
  const { user, accessToken, orderAsMode } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user || !accessToken) {
      setCount(null);
      return;
    }
    let cancelled = false;
    portalApi
      .getMyDistributors()
      .then((list) => {
        if (cancelled) return;
        setCount(list.find((d) => d.slug === distributorSlug)?.orderCount ?? null);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [distributorSlug, user, accessToken, orderAsMode]);

  return count;
}
