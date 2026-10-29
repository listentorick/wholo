import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordLinkConfig } from './record-link-config';
import { resolveIntegrationsTab, useRecordAccountingLink } from './useRecordAccountingLink';

let mockReloadSignal = 0;
vi.mock('@/lib/ingestion-sync-context', () => ({
  useIngestionSync: () => ({ reloadSignal: mockReloadSignal }),
}));

const load = vi.fn();
const config = { load } as unknown as RecordLinkConfig<{ id: string; displayName: string }>;
const result = { connection: null, link: null, change: null, suggestion: null, history: [] };

describe('useRecordAccountingLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReloadSignal = 0;
    load.mockResolvedValue(result);
  });

  it('loads the record link', async () => {
    const { result: hook } = renderHook(() => useRecordAccountingLink(config, 'rec-1', true));
    await waitFor(() => expect(hook.current.link).toEqual(result));
    expect(load).toHaveBeenCalledWith('rec-1');
  });

  it('fetches nothing when disabled', async () => {
    const { result: hook } = renderHook(() => useRecordAccountingLink(config, 'rec-1', false));
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    expect(hook.current.link).toBeNull();
  });

  it('falls back to no link when the lookup fails', async () => {
    load.mockRejectedValue(new Error('403'));
    const { result: hook } = renderHook(() => useRecordAccountingLink(config, 'rec-1', true));
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(hook.current.link).toBeNull();
  });

  it('keeps the last good link when a reload fails', async () => {
    const connected = { ...result, connection: { provider: 'FAKE', providerName: 'Fake Books', status: 'CONNECTED', lastSyncedAt: null } };
    load.mockResolvedValueOnce(connected).mockRejectedValueOnce(new Error('blip'));
    const { result: hook } = renderHook(() => useRecordAccountingLink(config, 'rec-1', true));
    await waitFor(() => expect(hook.current.accounting).toEqual(connected));
    await act(() => hook.current.refresh());
    expect(hook.current.accounting).toEqual(connected);
  });

  it('is settled once the first load finishes, and straight away when disabled', async () => {
    const { result: hook } = renderHook(() => useRecordAccountingLink(config, 'rec-1', true));
    expect(hook.current.settled).toBe(false);
    await waitFor(() => expect(hook.current.settled).toBe(true));
    const { result: off } = renderHook(() => useRecordAccountingLink(config, 'rec-1', false));
    expect(off.current.settled).toBe(true);
  });

  it('reloads when a sync finishes', async () => {
    const { rerender } = renderHook(() => useRecordAccountingLink(config, 'rec-1', true));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    mockReloadSignal = 1;
    rerender();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});

describe('resolveIntegrationsTab', () => {
  it('shows the tab when there is a connection', () => {
    expect(resolveIntegrationsTab('integrations', 'details', { accounting: {}, settled: true })).toEqual({ showTab: true, activeTab: 'integrations' });
  });

  it('holds a requested Integrations tab while the lookup is loading', () => {
    expect(resolveIntegrationsTab('integrations', 'details', { accounting: null, settled: false })).toEqual({ showTab: true, activeTab: 'integrations' });
  });

  it('falls back once loaded with no connection', () => {
    expect(resolveIntegrationsTab('integrations', 'details', { accounting: null, settled: true })).toEqual({ showTab: false, activeTab: 'details' });
  });

  it('leaves other tabs alone and hides Integrations until it is known', () => {
    expect(resolveIntegrationsTab('pricing', 'details', { accounting: null, settled: false })).toEqual({ showTab: false, activeTab: 'pricing' });
  });
});
