'use client';

import { useState } from 'react';
import { StatusBadge } from '@/components/list/StatusBadge';

interface Props {
  changeDetectedAt: string | null;
  changeAcknowledgedAt: string | null;
  onAcknowledge: () => Promise<void>;
}

// True while a linked row has a detected change the admin hasn't yet
// acknowledged — shared by the row highlight (border) and this badge, so the
// two never disagree about whether a row is "changed".
export function isRowChanged(changeDetectedAt: string | null, changeAcknowledgedAt: string | null): boolean {
  return !!changeDetectedAt && (!changeAcknowledgedAt || changeAcknowledgedAt < changeDetectedAt);
}

// Shown on a linked Products/Contacts/Tax types row when a later sync found
// the provider's value has moved since it was linked — the value itself is
// never updated automatically (see AccountingChangeDetectionService), so
// this is purely "something changed, go look", with an explicit dismissal.
export function ChangedIndicator({ changeDetectedAt, changeAcknowledgedAt, onAcknowledge }: Props) {
  const [acknowledging, setAcknowledging] = useState(false);

  if (!isRowChanged(changeDetectedAt, changeAcknowledgedAt)) return null;

  async function handleAcknowledge() {
    setAcknowledging(true);
    try {
      await onAcknowledge();
    } finally {
      setAcknowledging(false);
    }
  }

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <StatusBadge label="Changed" tone="yellow" />
      <button
        type="button"
        onClick={handleAcknowledge}
        disabled={acknowledging}
        className="text-xs text-muted hover:text-text transition-colors disabled:opacity-50"
      >
        {acknowledging ? '…' : 'Acknowledge'}
      </button>
    </div>
  );
}
