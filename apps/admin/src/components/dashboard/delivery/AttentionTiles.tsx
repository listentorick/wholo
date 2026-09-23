'use client';

import type { DeliveryOverview, DeliveryOverviewQueueKind } from '@wholo/types';
import { StatTileFrame } from '../StatTile';
import { formatWait } from './delivery';

export type QueueFilter = 'ALL' | DeliveryOverviewQueueKind;

interface Props {
  counts: DeliveryOverview['counts'];
  generatedAt: string;
  active: QueueFilter;
  onSelect: (filter: QueueFilter) => void;
}

// The same stat card as the Sales dashboard (StatTileFrame), made clickable: a
// tile filters the "Needs doing" list below it rather than linking away, so what
// needs a person and why stays on one screen. A zero reads "All clear" so a quiet
// day is good news, not an empty screen.
export function AttentionTiles({ counts, generatedAt, active, onSelect }: Props) {
  const tiles: Array<{ kind: DeliveryOverviewQueueKind; label: string; count: number; note: string }> = [
    {
      kind: 'TO_ACCEPT', label: 'To accept', count: counts.toAccept.count,
      note: counts.toAccept.oldestSubmittedAt ? `Oldest waiting ${formatWait(counts.toAccept.oldestSubmittedAt, generatedAt)}` : 'Waiting for you',
    },
    { kind: 'NOT_ON_RUN', label: 'Not on a run', count: counts.notOnRun.count, note: 'Due today' },
    { kind: 'OVERDUE', label: 'Overdue', count: counts.overdue.count, note: 'Past delivery date' },
    { kind: 'FAILED', label: 'Failed deliveries', count: counts.failedLast24h.count, note: 'Last 24 hours' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" role="group" aria-label="Needs attention">
      {tiles.map((tile) => (
        <StatTileFrame
          key={tile.kind}
          label={tile.label}
          value={tile.count}
          selected={active === tile.kind}
          onClick={() => onSelect(active === tile.kind ? 'ALL' : tile.kind)}
          footer={
            tile.count === 0
              ? <span className="text-xs font-medium text-green-600">All clear</span>
              : <span className="text-xs font-medium text-muted">{tile.note}</span>
          }
        />
      ))}
    </div>
  );
}
