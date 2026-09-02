'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { adminAccountingApi, adminOrdersApi } from '@wholo/admin-api-client';
import { useAuth } from './auth-context';

// The sidebar "needs attention" badges used to be fetched inside <Sidebar> on
// every mount. With the sidebar remounting on every navigation that made them
// blink out and back. Lifting the fetch into a provider in the root layout (the
// same place <NotificationProvider> lives) keeps the numbers stable across
// navigation and refreshes them on a gentle timer instead.
//
// 2 minutes, not the notification bell's 30s: orders and contact-sync issues
// don't arrive fast enough to warrant a tighter cadence.
const POLL_INTERVAL_MS = 120_000;

interface NavBadgesContextValue {
  /** Attention counts keyed by nav href, e.g. `{ '/orders': 3, '/integrations': 1 }`. */
  counts: Record<string, number>;
}

const NavBadgesContext = createContext<NavBadgesContextValue | null>(null);

export function NavBadgesProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  // Ref'd so the poll interval (set up once per accessToken change) always
  // calls with the latest token without needing to be its own effect dep.
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const refresh = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    // Best-effort — a failed call just leaves the badge at its last value.
    adminOrdersApi
      .countOrdersNeedingAttention(token)
      .then((res) => setCounts((c) => ({ ...c, '/orders': res.count })))
      .catch(() => {});
    adminAccountingApi
      .countContactsNeedingAttention(token)
      .then((res) => setCounts((c) => ({ ...c, '/integrations': res.count })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [accessToken, refresh]);

  return <NavBadgesContext.Provider value={{ counts }}>{children}</NavBadgesContext.Provider>;
}

export function useNavBadges() {
  const ctx = useContext(NavBadgesContext);
  if (!ctx) throw new Error('useNavBadges must be used within NavBadgesProvider');
  return ctx;
}
