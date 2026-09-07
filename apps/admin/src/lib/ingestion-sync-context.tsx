'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingSyncStatusResponse, IngestionRunSummary } from '@wholo/types';
import { useAuth } from './auth-context';

// Live status of the accounting ingestion (contacts / products / tax types).
// Held in a provider above the pages — like nav-badges-context — so a running
// sync still shows after navigating away and back. Polls slowly when idle,
// fast while a run is active or was just triggered from the UI. No push
// transport in this app (consistent with notification-context); see ADR-061.
const POLL_SLOW_MS = 30_000;
const POLL_FAST_MS = 3_000;
const TRIGGER_FAST_WINDOW_MS = 15_000;

const ACTIVE_STATUSES: IngestionRunSummary['status'][] = ['QUEUED', 'PROCESSING'];
const isActive = (run: IngestionRunSummary) => ACTIVE_STATUSES.includes(run.status);

interface IngestionSyncContextValue {
  runs: IngestionRunSummary[];
  activeRuns: IngestionRunSummary[];
  isSyncing: boolean;
  // At least one active run was triggered manually (→ full-screen takeover,
  // vs a non-blocking strip for a purely scheduled sync).
  hasManualActive: boolean;
  // A run has completed at least once — drives the "never synced" empty state.
  hasEverSynced: boolean;
  lastSucceededAt: string | null;
  // Bumped when the set of active runs drains to empty — consumers use it to
  // refetch lists / attention counts.
  reloadSignal: number;
  // Timestamp (ms) of the last active→idle transition, for a transient toast.
  syncCompletedAt: number | null;
  error: string | null;
  triggerSync: () => Promise<void>;
  refresh: () => Promise<void>;
}

const IngestionSyncContext = createContext<IngestionSyncContextValue | null>(null);

export function IngestionSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [runs, setRuns] = useState<IngestionRunSummary[]>([]);
  const [lastSucceededAt, setLastSucceededAt] = useState<string | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [syncCompletedAt, setSyncCompletedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justTriggeredAt, setJustTriggeredAt] = useState<number | null>(null);

  // Ref so the poll callback can compare against the previous active count
  // without being re-created (which would restart the interval).
  const prevActiveCountRef = useRef(0);

  const apply = useCallback((status: AccountingSyncStatusResponse) => {
    const nextActive = status.runs.filter(isActive).length;
    if (prevActiveCountRef.current > 0 && nextActive === 0) {
      setSyncCompletedAt(Date.now());
      setReloadSignal((n) => n + 1);
    }
    prevActiveCountRef.current = nextActive;
    setRuns(status.runs);
    setLastSucceededAt(status.lastSucceededAt);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const status = await adminAccountingApi.getSyncStatus();
      apply(status);
      setError(null);
    } catch {
      // Best-effort — keep the last known values (like nav-badges).
      setError('Could not refresh sync status');
    }
  }, [apply]);

  const triggerSync = useCallback(async () => {
    setJustTriggeredAt(Date.now());
    try {
      // The run rows come back already QUEUED, so isSyncing flips true with no
      // poll gap. Don't chase it with an immediate refresh() — that can race
      // and clobber this fresh state with a slightly stale poll; the escalated
      // fast interval picks up progress within a few seconds.
      const status = await adminAccountingApi.requestSync();
      apply(status);
      setError(null);
    } catch {
      setError('Could not start the sync');
      throw new Error('sync-request-failed');
    }
  }, [apply]);

  const activeRuns = useMemo(() => runs.filter(isActive), [runs]);
  const isSyncing = activeRuns.length > 0;
  const hasManualActive = activeRuns.some((r) => r.trigger === 'MANUAL');
  const hasEverSynced = runs.some((r) => r.status === 'COMPLETED') || lastSucceededAt != null;

  const withinTriggerWindow =
    justTriggeredAt != null && Date.now() - justTriggeredAt < TRIGGER_FAST_WINDOW_MS;
  const mode: 'fast' | 'slow' = isSyncing || withinTriggerWindow ? 'fast' : 'slow';

  // Initial poll — separate from the interval so a mode flip doesn't trigger an
  // extra immediate refresh that can race with optimistic state from triggerSync.
  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [user, refresh]);

  // A fresh interval whenever `mode` flips — setInterval can't change its own delay.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      void refresh();
    }, mode === 'fast' ? POLL_FAST_MS : POLL_SLOW_MS);
    return () => clearInterval(id);
  }, [user, mode, refresh]);

  const value: IngestionSyncContextValue = {
    runs,
    activeRuns,
    isSyncing,
    hasManualActive,
    hasEverSynced,
    lastSucceededAt,
    reloadSignal,
    syncCompletedAt,
    error,
    triggerSync,
    refresh,
  };

  return <IngestionSyncContext.Provider value={value}>{children}</IngestionSyncContext.Provider>;
}

export function useIngestionSync() {
  const ctx = useContext(IngestionSyncContext);
  if (!ctx) throw new Error('useIngestionSync must be used within IngestionSyncProvider');
  return ctx;
}
