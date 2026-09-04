'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  // `user` is the "authenticated and cleared for the admin app" signal — the
  // bearer for each poll comes from the centralised token provider in the
  // api-client, which refreshes it (and so recovers a suspended tab).
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    // Best-effort — a failed call just leaves the badge at its last value.
    adminOrdersApi
      .countOrdersNeedingAttention()
      .then((res) => setCounts((c) => ({ ...c, '/orders': res.count })))
      .catch(() => {});
    adminAccountingApi
      .countContactsNeedingAttention()
      .then((res) => setCounts((c) => ({ ...c, '/integrations': res.count })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, refresh]);

  return <NavBadgesContext.Provider value={{ counts }}>{children}</NavBadgesContext.Provider>;
}

export function useNavBadges() {
  const ctx = useContext(NavBadgesContext);
  if (!ctx) throw new Error('useNavBadges must be used within NavBadgesProvider');
  return ctx;
}
