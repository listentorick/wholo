'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountingRecordLink } from '@wholo/types';
import { useIngestionSync } from '@/lib/ingestion-sync-context';
import type { RecordLinkConfig } from './record-link-config';

type Connected<T> = T & { connection: NonNullable<AccountingRecordLink<unknown, string>['connection']> };

// Loads a record's accounting link once per page, so the header pill and the
// Integrations tab read the same copy and both update after any action.
// Reloads when a sync finishes, since a sync can create suggestions or flag
// a change. `enabled` is false without ACCOUNTING_READ — nothing is fetched.
//
// `accounting` is the link narrowed to one with a connection, or null when
// there is none. `settled` is true once the first load has finished (or was
// never needed), so pages can tell "no connection" from "not loaded yet".
export function useRecordAccountingLink<TExternal extends { id: string; displayName: string }>(
  config: RecordLinkConfig<TExternal>,
  recordId: string | undefined,
  enabled: boolean,
) {
  const { reloadSignal } = useIngestionSync();
  const [link, setLink] = useState<AccountingRecordLink<TExternal, string> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || !recordId) return;
    try {
      setLink(await config.load(recordId));
    } catch {
      // A failed first load shows no tab. A failed reload keeps the last good
      // link, so the tab doesn't vanish from under someone mid-action.
      if (!loadedRef.current) setLink(null);
    } finally {
      loadedRef.current = true;
      setLoaded(true);
    }
  }, [config, recordId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh, reloadSignal]);

  const accounting = link?.connection ? (link as Connected<AccountingRecordLink<TExternal, string>>) : null;
  return { link, accounting, settled: !enabled || loaded, refresh };
}

// The one rule for the Integrations tab on a record page: shown when there is
// a connection. A ?tab=integrations link waits for the lookup rather than
// flashing the fallback tab, then falls back if there is no connection.
export function resolveIntegrationsTab<TKey extends string>(
  requested: TKey,
  fallback: TKey,
  state: { accounting: unknown; settled: boolean },
): { showTab: boolean; activeTab: TKey } {
  const wantsIntegrations = requested === 'integrations';
  const showTab = !!state.accounting || (wantsIntegrations && !state.settled);
  return { showTab, activeTab: wantsIntegrations && !showTab ? fallback : requested };
}
