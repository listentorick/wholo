import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { AccountingSyncStatusResponse, IngestionRunSummary } from '@wholo/types';
import { IngestionSyncProvider, useIngestionSync } from './ingestion-sync-context';

const getSyncStatus = vi.fn();
const requestSync = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: {
    getSyncStatus: (...a: unknown[]) => getSyncStatus(...a),
    requestSync: (...a: unknown[]) => requestSync(...a),
  },
}));

const authState: { user: { id: string } | null } = { user: { id: 'u1' } };
vi.mock('./auth-context', () => ({ useAuth: () => authState }));

function run(status: IngestionRunSummary['status'], resourceType = 'contact'): IngestionRunSummary {
  return {
    id: `r-${resourceType}`,
    sourceType: 'accounting',
    sourceRef: 'conn-1',
    resourceType,
    status,
    trigger: 'MANUAL',
    recordsTotal: null,
    recordsProcessed: 0,
    recordsFailed: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsRemoved: 0,
    detailCount: 0,
    errorMessage: null,
    queuedAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
  };
}
const idle: AccountingSyncStatusResponse = { runs: [run('COMPLETED')], lastSucceededAt: '2026-01-01T00:00:00.000Z' };
const active: AccountingSyncStatusResponse = { runs: [run('PROCESSING')], lastSucceededAt: null };

function Probe() {
  const { isSyncing, hasEverSynced, reloadSignal, triggerSync } = useIngestionSync();
  return (
    <div>
      <span data-testid="syncing">{String(isSyncing)}</span>
      <span data-testid="ever">{String(hasEverSynced)}</span>
      <span data-testid="reload">{reloadSignal}</span>
      <button onClick={() => void triggerSync()}>go</button>
    </div>
  );
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { id: 'u1' };
  getSyncStatus.mockResolvedValue(idle);
  requestSync.mockResolvedValue(active);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('IngestionSyncProvider', () => {
  it('does not poll without an authenticated user', async () => {
    authState.user = null;
    render(<IngestionSyncProvider><Probe /></IngestionSyncProvider>);
    await flush();
    expect(getSyncStatus).not.toHaveBeenCalled();
  });

  it('polls on mount and exposes idle state', async () => {
    render(<IngestionSyncProvider><Probe /></IngestionSyncProvider>);
    await flush();
    expect(getSyncStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('syncing').textContent).toBe('false');
    expect(screen.getByTestId('ever').textContent).toBe('true');
  });

  it('escalates to the fast poll interval while a run is active', async () => {
    vi.useFakeTimers();
    getSyncStatus.mockResolvedValue(active);
    render(<IngestionSyncProvider><Probe /></IngestionSyncProvider>);
    await flush();
    expect(getSyncStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('syncing').textContent).toBe('true');

    await act(async () => { vi.advanceTimersByTime(3_000); });
    await flush();
    expect(getSyncStatus).toHaveBeenCalledTimes(2); // 3s cadence, not 30s
  });

  it('bumps reloadSignal when the active runs drain to terminal', async () => {
    vi.useFakeTimers();
    getSyncStatus.mockResolvedValueOnce(active).mockResolvedValue(idle);
    render(<IngestionSyncProvider><Probe /></IngestionSyncProvider>);
    await flush();
    expect(screen.getByTestId('syncing').textContent).toBe('true');
    expect(screen.getByTestId('reload').textContent).toBe('0');

    await act(async () => { vi.advanceTimersByTime(3_000); });
    await flush();
    expect(screen.getByTestId('syncing').textContent).toBe('false');
    expect(screen.getByTestId('reload').textContent).toBe('1');
  });

  it('triggerSync flips isSyncing immediately from the response', async () => {
    render(<IngestionSyncProvider><Probe /></IngestionSyncProvider>);
    await flush();
    expect(screen.getByTestId('syncing').textContent).toBe('false');

    await act(async () => {
      screen.getByText('go').click();
    });
    await flush();
    expect(requestSync).toHaveBeenCalled();
    expect(screen.getByTestId('syncing').textContent).toBe('true');
  });
});
