'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { adminTeamApi } from '@wholo/admin-api-client';
import type { SupportGrant } from '@wholo/types';
import { useAuth } from './auth-context';
import { isOpsBuild } from './ops-mode';

// Stocdup support visits open at this distributor right now (ADR-078). Held in
// the root layout, like the nav badges, so the strip on every page and the Team
// page's support section share one list: ending a visit on the Team page clears
// the strip at once instead of on the next focus or poll.
//
// 2 minutes, as for the nav badges: a visit lasts hours, and focusing the tab
// refreshes it too.
const POLL_INTERVAL_MS = 120_000;

interface SupportPresenceContextValue {
  /** Visits open now; empty until loaded, and always empty in the Ops build. */
  active: SupportGrant[];
  /** Reload after anything that opens or ends a visit. */
  refresh: () => Promise<void>;
}

const SupportPresenceContext = createContext<SupportPresenceContextValue | null>(null);

export function SupportPresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [active, setActive] = useState<SupportGrant[]>([]);

  const refresh = useCallback(async () => {
    try {
      setActive(await adminTeamApi.supportGrants({ activeOnly: true }));
    } catch {
      // Best-effort: the Team page shows the full picture.
    }
  }, []);

  useEffect(() => {
    // The distributor's own people are told; an operator in the Ops build is the visitor.
    if (!user || isOpsBuild) return;
    void refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [user, refresh]);

  return <SupportPresenceContext.Provider value={{ active, refresh }}>{children}</SupportPresenceContext.Provider>;
}

export function useSupportPresence() {
  const ctx = useContext(SupportPresenceContext);
  if (!ctx) throw new Error('useSupportPresence must be used within SupportPresenceProvider');
  return ctx;
}
