import type { DeliveryCard as DeliveryCardType, DeliveryDayBoard, DeliveryRunColumn } from '@wholo/types';
import { ListTableShell } from '@/components/list/ListTableShell';
import { MobileCardList } from '@/components/list/MobileCardList';
import { MobileCardField } from '@/components/list/MobileCardField';
import { DeliveryCardActions } from './DeliveryCardActions';
import { RunHeaderControls } from './RunHeaderControls';
import { unallocatedReasonCopy, lineItemsCopy } from './attention';

export interface DeliveryListRow {
  card: DeliveryCardType;
  runId: string | null;
  isFirst: boolean;
  isLast: boolean;
}

interface DeliveryListGroup {
  runId: string | null;   // null = the Unassigned group
  runName: string;
  runStatus: 'OPEN' | 'READY' | null;
  runDriverName: string | null;
  rows: DeliveryListRow[];
}

interface DeliveryRunListProps {
  board: DeliveryDayBoard;
  pendingOrderId: string | null;
  pendingRunId: string | null;
  filterUnassignedOnly?: boolean;
  filterMissedOnly?: boolean;
  onMove: (orderId: string, fromRunId: string | null, toRunId: string | null) => void;
  onMoveUpDown: (row: DeliveryListRow, direction: 'up' | 'down') => void;
  onMarkReady: (runId: string) => Promise<void>;
  onReopen: (runId: string) => Promise<void>;
  onSetDriver: (runId: string, driverName: string | null) => void;
  onChangeDate: (orderId: string) => void;
}

// Grouped by run, one bordered section per group — not a flat list. Mark
// ready/reopen/driver-override need a run-level UI anchor that a flat,
// row-per-card list doesn't have, so this mirrors the Board's per-column
// structure instead (a deliberate reversal of the M3 flat-list decision,
// made when List view had no run-level actions to anchor).
// Group order mirrors Board view: Unassigned first, then each run in board
// order; each group's cards in stop-number order.
function buildGroups(board: DeliveryDayBoard): DeliveryListGroup[] {
  const unassignedGroup: DeliveryListGroup = {
    runId: null,
    runName: 'Unassigned',
    runStatus: null,
    runDriverName: null,
    rows: board.unassigned.map((card): DeliveryListRow => ({
      card, runId: null, isFirst: false, isLast: false,
    })),
  };
  const runGroups = board.runs.map((run): DeliveryListGroup => ({
    runId: run.runId,
    runName: run.name,
    runStatus: run.status,
    runDriverName: run.driverName,
    rows: run.cards.map((card, index): DeliveryListRow => ({
      card, runId: run.runId, isFirst: index === 0, isLast: index === run.cards.length - 1,
    })),
  }));
  return [unassignedGroup, ...runGroups];
}

function findAllRuns(board: DeliveryDayBoard): DeliveryRunColumn[] {
  return board.runs;
}

function GroupHeader({
  group, pending, onMarkReady, onReopen, onSetDriver,
}: {
  group: DeliveryListGroup;
  pending: boolean;
  onMarkReady: (runId: string) => Promise<void>;
  onReopen: (runId: string) => Promise<void>;
  onSetDriver: (runId: string, driverName: string | null) => void;
}) {
  if (group.runId === null) {
    return <h3 className="text-sm font-semibold text-text">Unassigned</h3>;
  }
  return (
    <RunHeaderControls
      // runStatus is only ever null for the Unassigned group (runId ===
      // null), already handled above — safe to narrow here.
      run={{
        runId: group.runId, name: group.runName, driverName: group.runDriverName, status: group.runStatus as 'OPEN' | 'READY',
      }}
      pending={pending}
      onMarkReady={onMarkReady}
      onReopen={onReopen}
      onSetDriver={onSetDriver}
    />
  );
}

function GroupSection({
  group, allRuns, pendingOrderId, pendingRunId, onMove, onMoveUpDown, onMarkReady, onReopen, onSetDriver, onChangeDate,
}: {
  group: DeliveryListGroup;
  allRuns: DeliveryRunColumn[];
  pendingOrderId: string | null;
  pendingRunId: string | null;
  onMove: (orderId: string, fromRunId: string | null, toRunId: string | null) => void;
  onMoveUpDown: (row: DeliveryListRow, direction: 'up' | 'down') => void;
  onMarkReady: (runId: string) => Promise<void>;
  onReopen: (runId: string) => Promise<void>;
  onSetDriver: (runId: string, driverName: string | null) => void;
  onChangeDate: (orderId: string) => void;
}) {
  return (
    <ListTableShell>
      <div className="border-b border-border p-3">
        <GroupHeader
          group={group}
          pending={pendingRunId === group.runId}
          onMarkReady={onMarkReady}
          onReopen={onReopen}
          onSetDriver={onSetDriver}
        />
      </div>

      {group.rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted">No deliveries yet</p>
      ) : (
        <>
          <MobileCardList
            items={group.rows}
            getId={(row) => row.card.orderId}
            getLabel={(row) => row.card.customerName}
            entityLabelPlural="deliveries"
            renderPrimary={(row) => row.card.customerName}
            renderSecondary={(row) => row.card.orderNumber}
            renderStatus={() => null}
            renderMeta={(row) => (
              <div className="mt-1.5">
                <DeliveryCardActions
                  currentRunId={row.runId}
                  runs={allRuns}
                  suggestedRunId={row.card.suggestedRunId}
                  attention={row.card.attention}
                  disabled={pendingOrderId === row.card.orderId || group.runStatus === 'READY'}
                  isFirst={row.isFirst}
                  isLast={row.isLast}
                  onMove={(targetRunId) => onMove(row.card.orderId, row.runId, targetRunId)}
                  onMoveUpDown={row.runId ? (direction) => onMoveUpDown(row, direction) : undefined}
                  onChangeDate={() => onChangeDate(row.card.orderId)}
                />
              </div>
            )}
            renderExpanded={(row) => (
              <>
                <MobileCardField label="Lines · items" value={lineItemsCopy(row.card.lineCount, row.card.itemCount)} />
                {row.card.unallocatedReason != null && (
                  <MobileCardField label="Reason" tone="muted" value={unallocatedReasonCopy(row.card.unallocatedReason)} />
                )}
              </>
            )}
          />

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead className="border-b border-border bg-[#fafafa]">
                <tr>
                  <th className="py-3 pl-5 pr-4 text-xs font-medium uppercase tracking-wider text-muted">Customer</th>
                  <th className="py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted">Order</th>
                  <th className="py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted">Lines · items</th>
                  <th className="py-3 px-4 text-xs font-medium uppercase tracking-wider text-muted">Status</th>
                  <th className="py-3 pl-4 pr-5 text-xs font-medium uppercase tracking-wider text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.card.orderId} className="border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors">
                    <td className="py-3 pl-5 pr-4 text-sm font-medium text-text">{row.card.customerName}</td>
                    <td className="py-3 px-4 text-sm text-muted">{row.card.orderNumber}</td>
                    <td className="py-3 px-4 text-sm text-muted">{lineItemsCopy(row.card.lineCount, row.card.itemCount)}</td>
                    <td className="py-3 px-4 text-xs text-blue-700">
                      {row.card.unallocatedReason != null ? unallocatedReasonCopy(row.card.unallocatedReason) : '—'}
                    </td>
                    <td className="py-3 pl-4 pr-5">
                      <DeliveryCardActions
                        currentRunId={row.runId}
                        runs={allRuns}
                        suggestedRunId={row.card.suggestedRunId}
                        disabled={pendingOrderId === row.card.orderId || group.runStatus === 'READY'}
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
        </>
      )}
    </ListTableShell>
  );
}

export function DeliveryRunList({
  board, pendingOrderId, pendingRunId, filterUnassignedOnly, filterMissedOnly, onMove, onMoveUpDown,
  onMarkReady, onReopen, onSetDriver, onChangeDate,
}: DeliveryRunListProps) {
  const allGroups = buildGroups(board);
  // Filtered mode drops empty groups entirely (an OPEN run with only
  // assigned cards has nothing to show); unfiltered mode keeps every group,
  // even an empty run, mirroring Board view's RunColumn always rendering.
  const attentionToShow = filterMissedOnly ? 'MISSED' : filterUnassignedOnly ? 'UNASSIGNED' : null;
  const groups = attentionToShow
    ? allGroups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => r.card.attention === attentionToShow) }))
      .filter((g) => g.rows.length > 0)
    : allGroups;
  const allRuns = findAllRuns(board);

  if (groups.length === 0) {
    return (
      <ListTableShell>
        <p className="px-5 py-10 text-center text-sm text-muted">No deliveries match this filter.</p>
      </ListTableShell>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <GroupSection
          key={group.runId ?? 'unassigned'}
          group={group}
          allRuns={allRuns}
          pendingOrderId={pendingOrderId}
          pendingRunId={pendingRunId}
          onMove={onMove}
          onMoveUpDown={onMoveUpDown}
          onMarkReady={onMarkReady}
          onReopen={onReopen}
          onSetDriver={onSetDriver}
          onChangeDate={onChangeDate}
        />
      ))}
    </div>
  );
}
