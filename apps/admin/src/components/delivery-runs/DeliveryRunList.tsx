import type { DeliveryCard as DeliveryCardType, DeliveryDayBoard, DeliveryRunColumn } from '@wholo/types';
import { ListTableShell } from '@/components/list/ListTableShell';
import { MobileCardList } from '@/components/list/MobileCardList';
import { MobileCardField } from '@/components/list/MobileCardField';
import { StatusBadge } from '@/components/list/StatusBadge';
import { DeliveryCardActions } from './DeliveryCardActions';
import {
  READY_BADGE, OPEN_BADGE, UNASSIGNED_BADGE, unallocatedReasonCopy, lineItemsCopy,
} from './attention';

export interface DeliveryListRow {
  card: DeliveryCardType;
  runId: string | null;
  runName: string;
  runStatus: 'OPEN' | 'READY' | null;
  isFirst: boolean;
  isLast: boolean;
}

interface DeliveryRunListProps {
  board: DeliveryDayBoard;
  pendingOrderId: string | null;
  filterUnassignedOnly?: boolean;
  onMove: (orderId: string, fromRunId: string | null, toRunId: string | null) => void;
  onMoveUpDown: (row: DeliveryListRow, direction: 'up' | 'down') => void;
}

// A single flat list, not one table per run — MobileCardList/<table> both
// take a flat items array, so each row carries its own Run column rather
// than a separate group-header row, matching the AccountingContactsTable
// precedent exactly (no new grouping concept invented for this view).
// Row order mirrors Board view: Unassigned first, then each run in board
// order, each group's cards in stop-number order.
function buildRows(board: DeliveryDayBoard): DeliveryListRow[] {
  const unassignedRows = board.unassigned.map((card): DeliveryListRow => ({
    card, runId: null, runName: 'Unassigned', runStatus: null, isFirst: false, isLast: false,
  }));
  const runRows = board.runs.flatMap((run) => run.cards.map((card, index): DeliveryListRow => ({
    card,
    runId: run.runId,
    runName: run.name,
    runStatus: run.status,
    isFirst: index === 0,
    isLast: index === run.cards.length - 1,
  })));
  return [...unassignedRows, ...runRows];
}

function RunCell({ row }: { row: DeliveryListRow }) {
  if (row.runStatus === null) {
    return <StatusBadge label={UNASSIGNED_BADGE.label} tone={UNASSIGNED_BADGE.tone} />;
  }
  const badge = row.runStatus === 'READY' ? READY_BADGE : OPEN_BADGE;
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-text">{row.runName}</span>
      <StatusBadge label={badge.label} tone={badge.tone} />
    </div>
  );
}

function findAllRuns(board: DeliveryDayBoard): DeliveryRunColumn[] {
  return board.runs;
}

export function DeliveryRunList({
  board, pendingOrderId, filterUnassignedOnly, onMove, onMoveUpDown,
}: DeliveryRunListProps) {
  const allRows = buildRows(board);
  const rows = filterUnassignedOnly ? allRows.filter((r) => r.card.attention === 'UNASSIGNED') : allRows;
  const allRuns = findAllRuns(board);

  if (rows.length === 0) {
    return (
      <ListTableShell>
        <p className="px-5 py-10 text-center text-sm text-muted">No deliveries match this filter.</p>
      </ListTableShell>
    );
  }

  return (
    <ListTableShell>
      <MobileCardList
        items={rows}
        getId={(row) => row.card.orderId}
        getLabel={(row) => row.card.customerName}
        entityLabelPlural="deliveries"
        renderPrimary={(row) => row.card.customerName}
        renderSecondary={(row) => row.card.orderNumber}
        renderStatus={() => null}
        renderMeta={(row) => (
          <div className="mt-1.5">
            <RunCell row={row} />
            <div className="mt-1.5">
              <DeliveryCardActions
                currentRunId={row.runId}
                runs={allRuns}
                suggestedRunId={row.card.suggestedRunId}
                disabled={pendingOrderId === row.card.orderId || row.runStatus === 'READY'}
                isFirst={row.isFirst}
                isLast={row.isLast}
                onMove={(targetRunId) => onMove(row.card.orderId, row.runId, targetRunId)}
                onMoveUpDown={row.runId ? (direction) => onMoveUpDown(row, direction) : undefined}
              />
            </div>
          </div>
        )}
        renderExpanded={(row) => (
          <>
            <MobileCardField label="Lines · items" value={lineItemsCopy(row.card.lineCount, row.card.itemCount)} />
            {row.card.attention === 'UNASSIGNED' && (
              <MobileCardField label="Reason" tone="muted" value={unallocatedReasonCopy(row.card.unallocatedReason)} />
            )}
          </>
        )}
      />

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left">
          <thead className="border-b border-border bg-[#fafafa]">
            <tr>
              <th className="py-3 pl-5 pr-4 text-xs font-medium uppercase tracking-wider text-muted">Run</th>
              <th className="py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted">Customer</th>
              <th className="py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted">Order</th>
              <th className="py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted">Lines · items</th>
              <th className="py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted">Status</th>
              <th className="py-3 pl-4 pr-5 text-xs font-medium uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.card.orderId} className="border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors">
                <td className="py-3 pl-5 pr-4"><RunCell row={row} /></td>
                <td className="py-3 px-4 text-sm font-medium text-text">{row.card.customerName}</td>
                <td className="py-3 px-4 text-sm text-muted">{row.card.orderNumber}</td>
                <td className="py-3 px-4 text-sm text-muted">{lineItemsCopy(row.card.lineCount, row.card.itemCount)}</td>
                <td className="py-3 px-4 text-xs text-blue-700">
                  {row.card.attention === 'UNASSIGNED' ? unallocatedReasonCopy(row.card.unallocatedReason) : '—'}
                </td>
                <td className="py-3 pl-4 pr-5">
                  <DeliveryCardActions
                    currentRunId={row.runId}
                    runs={allRuns}
                    suggestedRunId={row.card.suggestedRunId}
                    disabled={pendingOrderId === row.card.orderId || row.runStatus === 'READY'}
                    isFirst={row.isFirst}
                    isLast={row.isLast}
                    onMove={(targetRunId) => onMove(row.card.orderId, row.runId, targetRunId)}
                    onMoveUpDown={row.runId ? (direction) => onMoveUpDown(row, direction) : undefined}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ListTableShell>
  );
}
