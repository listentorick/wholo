'use client';

import { useState } from 'react';
import type { DeliveryRunColumn } from '@wholo/types';
import { StatusBadge } from '@/components/list/StatusBadge';
import { READY_BADGE, OPEN_BADGE } from './attention';
import { RunDriverField } from './RunDriverField';
import { MarkReadyDialog } from './MarkReadyDialog';
import { ReopenConfirm } from './ReopenConfirm';
import { DriverManifestButton } from './DriverManifestButton';

interface Props {
  run: Pick<DeliveryRunColumn, 'runId' | 'name' | 'driverName' | 'status'>;
  // True while this specific run has a status/driver mutation in flight —
  // drives both the confirm dialog's `submitting` state and RunDriverField.
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
          <RunDriverField
            driverName={run.driverName}
            locked={isReady}
            saving={pending}
            onSave={(driverName) => onSetDriver(run.runId, driverName)}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge label={badge.label} tone={badge.tone} />
          {isReady && <DriverManifestButton runId={run.runId} />}
          <button
            type="button"
            onClick={() => setConfirming(isReady ? 'reopen' : 'ready')}
            disabled={pending}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text transition-colors hover:bg-border/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isReady ? 'Reopen' : 'Mark ready'}
          </button>
        </div>
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
