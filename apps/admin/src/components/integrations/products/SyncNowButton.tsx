'use client';

import { useEffect, useState } from 'react';
import { adminAccountingApi } from '@wholo/admin-api-client';

interface Props {
  token: string;
  onQueued?: () => void;
}

export function SyncNowButton({ token, onQueued }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!queued) return;
    const t = setTimeout(() => setQueued(false), 5000);
    return () => clearTimeout(t);
  }, [queued]);

  async function handleClick() {
    setSyncing(true);
    setError(null);
    try {
      await adminAccountingApi.syncProducts(token);
      setQueued(true);
      onQueued?.();
    } catch {
      setError('Failed to queue a sync. Please try again.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={syncing}
        className="rounded-md border border-border bg-white px-3.5 py-2 text-sm font-medium text-text transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
      >
        {syncing ? 'Queuing…' : 'Sync now'}
      </button>
      {queued && <span className="text-xs text-muted">Sync queued — new products will appear shortly.</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
