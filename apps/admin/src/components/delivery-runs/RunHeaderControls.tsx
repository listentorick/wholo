'use client';

import { useState } from 'react';
import type { DeliveryRunColumn } from '@wholo/types';
import { StatusBadge } from '@/components/list/StatusBadge';
import { READY_BADGE, OPEN_BADGE } from './attention';
import { MarkReadyDialog } from './MarkReadyDialog';
import { ReopenConfirm } from './ReopenConfirm';
import { DriverManifestButton } from './DriverManifestButton';

interface Props {
  run: Pick<DeliveryRunColumn, 'runId' | 'name' | 'driverName' | 'status'>;
  // True while this specific run has a status mutation in flight — drives
  // the confirm dialog's `submitting` state.
  pending: boolean;
  onMarkReady: (runId: string) => Promise<void>;
  onReopen: (runId: string) => Promise<void>;
  onSetDriver: (runId: string, driverName: string | null) => void;
}

// Shared by RunColumn (Board) and DeliveryRunList's per-run group header
// (List) — written once so mark-ready/reopen/driver-override behave
// identically on both surfaces, per the M4 plan.
export function RunHeaderControls({
  run, pending, onMarkReady, onReopen, onSetDriver,
}: Props) {
  const [confirming, setConfirming] = useState<'ready' | 'reopen' | null>(null);
  const isReady = run.status === 'READY';
  const badge = isReady ? READY_BADGE : OPEN_BADGE;

  async function handleConfirm() {
    if (confirming === 'ready') await onMarkReady(run.runId);
    else if (confirming === 'reopen') await onReopen(run.runId);
    setConfirming(null);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text">{run.name}</h3>
        </div>
        <div className="shrink-0">
          <StatusBadge label={badge.label} tone={badge.tone} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <DriverManifestButton runId={run.runId} locked={!isReady} />
        <button
          type="button"
          onClick={() => setConfirming(isReady ? 'reopen' : 'ready')}
          disabled={pending}
          className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            isReady
              ? 'border-border text-text hover:bg-border/20'
              : 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10'
          }`}
        >
          {isReady ? 'Reopen' : 'Mark ready'}
        </button>
      </div>
      {confirming === 'ready' && (
        <MarkReadyDialog
          runName={run.name}
          submitting={pending}
          onCancel={() => setConfirming(null)}
          onConfirm={handleConfirm}
        />
      )}
      {confirming === 'reopen' && (
        <ReopenConfirm
          runName={run.name}
          submitting={pending}
          onCancel={() => setConfirming(null)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
