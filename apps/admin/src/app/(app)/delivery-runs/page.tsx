'use client';

import { useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { adminDeliveryRunsApi, ApiError } from '@wholo/admin-api-client';
import { useAuth } from '@/lib/auth-context';
import { ListPageHeader } from '@/components/list/ListPageHeader';
import { ListSpinner } from '@/components/list/ListSpinner';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { useDeliveryDay } from '@/lib/hooks/use-delivery-day';
import { applyMove, applyReorder, applyRunUpdate } from '@/lib/optimistic-board-update';
import {
  toIso, startOfWeek, addDays,
} from '@/lib/date';
import { WorkloadStrip } from '@/components/delivery-runs/WorkloadStrip';
import { DeliveryDateRangeControl } from '@/components/delivery-runs/DeliveryDateRangeControl';
import { UndatedDeliveriesPanel } from '@/components/delivery-runs/UndatedDeliveriesPanel';
import { BoardViewToggle, type BoardViewMode } from '@/components/delivery-runs/BoardViewToggle';
import { DeliveryBoardFilters, type BoardAttentionFilter } from '@/components/delivery-runs/DeliveryBoardFilters';
import { DeliveryRunBoard } from '@/components/delivery-runs/DeliveryRunBoard';
import { DeliveryRunList, type DeliveryListRow } from '@/components/delivery-runs/DeliveryRunList';
import { ChangeDeliveryDateDialog } from '@/components/delivery-runs/ChangeDeliveryDateDialog';

function DeliveryRunsEmptyState() {
  return (
    <ListEmptyState
      icon={
        <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
          <rect x="8" y="20" width="34" height="26" rx="3" className="stroke-primary" strokeWidth="3" />
          <path d="M42 28h9l5 7v11h-5" className="stroke-primary" strokeWidth="3" strokeLinejoin="round" fill="none" />
          <circle cx="20" cy="48" r="4" className="fill-primary/40" />
          <circle cx="46" cy="48" r="4" className="fill-primary/40" />
        </svg>
      }
      title="No deliveries for this day"
      description="Accepted orders with a scheduled delivery date will appear here, either allocated to a run or waiting to be assigned."
    />
  );
}

export default function DeliveryRunsPage() {
  const { accessToken } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => toIso(new Date()));
  // The week WorkloadStrip and DeliveryDateRangeControl both render — kept
  // here, not inside WorkloadStrip, so the two stay in sync: picking a date
  // from the header control's native date picker can land outside the
  // currently-visible week, and both surfaces need to move together.
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(`${selectedDate}T00:00:00`)));
  const weekEnd = addDays(weekStart, 6);
  const [viewMode, setViewMode] = useState<BoardViewMode>('board');
  const [attentionFilter, setAttentionFilter] = useState<BoardAttentionFilter>('all');
  const [mutationBanner, setMutationBanner] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [changeDateOrderId, setChangeDateOrderId] = useState<string | null>(null);
  // Bumped after a successful reschedule so WorkloadStrip re-fetches — it's
  // the only mutation that moves a stop's count from one day to another;
  // move/reorder/mark-ready/reopen all stay within the currently viewed day.
  const [workloadRefreshKey, setWorkloadRefreshKey] = useState(0);

  const {
    board, isLoading, isRefreshing, error, refetch, mutate,
  } = useDeliveryDay(accessToken, selectedDate);

  // Mutation flow: never auto-retry a 409 — the board the user acted on no
  // longer exists, so the only correct move is a fresh re-GET.
  // Optimistic update: reorder/move the board locally, synchronously, before
  // the mutation even starts. Without this, dnd-kit's SortableContext
  // re-renders the dropped card against the still-unchanged board on the
  // very next frame and CSS-transitions it back to its old slot, then jumps
  // it to the real slot once the response lands — a confusing snap-back-
  // then-disappear flicker. Roll back to previousBoard on failure.
  async function handleMove(orderId: string, fromRunId: string | null, toRunId: string | null) {
    if (!board || !accessToken) return;
    const previousBoard = board;
    setPendingOrderId(orderId);
    setMutationBanner(null);
    mutate(applyMove(board, orderId, fromRunId, toRunId));
    try {
      let refreshed;
      if (toRunId === null) {
        const sourceRun = board.runs.find((r) => r.runId === fromRunId);
        if (!sourceRun || !fromRunId) return;
        refreshed = await adminDeliveryRunsApi.unassignOrderFromRun(accessToken, fromRunId, orderId, sourceRun.version);
      } else {
        const destinationRun = board.runs.find((r) => r.runId === toRunId);
        if (!destinationRun) return;
        refreshed = await adminDeliveryRunsApi.assignOrderToRun(accessToken, toRunId, {
          orderId,
          version: destinationRun.version,
          sourceRunId: fromRunId ?? undefined,
        });
      }
      mutate(refreshed);
    } catch (e) {
      mutate(previousBoard);
      if (e instanceof ApiError && e.status === 409) {
        setMutationBanner('This board changed elsewhere — refreshed.');
        await refetch();
      } else if (e instanceof ApiError && e.status === 422) {
        setMutationBanner(e.problem.detail ?? 'That move is not allowed.');
        await refetch();
      } else {
        setMutationBanner('Could not move the delivery. Please try again.');
      }
    } finally {
      setPendingOrderId(null);
    }
  }

  async function handleReorder(runId: string, orderedOrderIds: string[]) {
    if (!board || !accessToken) return;
    const run = board.runs.find((r) => r.runId === runId);
    if (!run) return;
    const previousBoard = board;
    setMutationBanner(null);
    mutate(applyReorder(board, runId, orderedOrderIds));
    try {
      const refreshed = await adminDeliveryRunsApi.reorderRunOrders(accessToken, runId, { version: run.version, orderedOrderIds });
      mutate(refreshed);
    } catch (e) {
      mutate(previousBoard);
      if (e instanceof ApiError && e.status === 409) {
        setMutationBanner('This board changed elsewhere — refreshed.');
        await refetch();
      } else {
        setMutationBanner('Could not reorder the run. Please try again.');
      }
    }
  }

  // Mark ready / reopen / driver-override — one PATCH, same optimistic-
  // update-then-rollback shape as handleMove/handleReorder above.
  async function handleUpdateRun(runId: string, patch: { status?: 'OPEN' | 'READY'; driverName?: string | null }) {
    if (!board || !accessToken) return;
    const run = board.runs.find((r) => r.runId === runId);
    if (!run) return;
    const previousBoard = board;
    setPendingRunId(runId);
    setMutationBanner(null);
    mutate(applyRunUpdate(board, runId, patch));
    try {
      const refreshed = await adminDeliveryRunsApi.updateRun(accessToken, runId, { version: run.version, ...patch });
      mutate(refreshed);
    } catch (e) {
      mutate(previousBoard);
      if (e instanceof ApiError && e.status === 409) {
        setMutationBanner('This board changed elsewhere — refreshed.');
        await refetch();
      } else if (e instanceof ApiError && e.status === 422) {
        setMutationBanner(e.problem.detail ?? 'That change is not allowed.');
        await refetch();
      } else {
        setMutationBanner('Could not update the run. Please try again.');
      }
    } finally {
      setPendingRunId(null);
    }
  }

  function handleMarkReady(runId: string) {
    return handleUpdateRun(runId, { status: 'READY' });
  }

  function handleReopen(runId: string) {
    return handleUpdateRun(runId, { status: 'OPEN' });
  }

  function handleSetDriver(runId: string, driverName: string | null) {
    return handleUpdateRun(runId, { driverName });
  }

  function findCard(orderId: string) {
    if (!board) return null;
    return board.unassigned.find((c) => c.orderId === orderId)
      ?? board.runs.flatMap((r) => r.cards).find((c) => c.orderId === orderId)
      ?? null;
  }

  // Single entry point for changing the selected day — used by both
  // WorkloadStrip's day-cell clicks (always inside the current week) and
  // DeliveryDateRangeControl's date picker (can land anywhere). Only moves
  // weekStart when the picked date is actually outside the current week —
  // the equality check keeps ordinary in-week clicks from creating a new
  // weekStart object and triggering a redundant WorkloadStrip re-fetch.
  function handleSelectDate(date: string) {
    setSelectedDate(date);
    const candidate = startOfWeek(new Date(`${date}T00:00:00`));
    setWeekStart((prev) => (prev.getTime() === candidate.getTime() ? prev : candidate));
  }

  // Unlike handleMove/handleReorder/handleUpdateRun above, this has no
  // optimistic pre-update — it's a modal-gated action (not drag/drop), so a
  // brief isRefreshing dim is acceptable, and the mutation can move the card
  // to a different day than the one on screen, so there's no local board
  // shape to optimistically compute. Always closes the dialog afterwards
  // (success or failure), same as RunHeaderControls' confirm dialogs.
  async function handleChangeDeliveryDate(
    orderId: string,
    params: { scheduledDeliveryDate: string; expectedScheduledDeliveryDate: string | null },
  ) {
    if (!accessToken) return;
    setPendingOrderId(orderId);
    setMutationBanner(null);
    try {
      await adminDeliveryRunsApi.changeScheduledDeliveryDate(accessToken, orderId, params);
      await refetch();
      setWorkloadRefreshKey((k) => k + 1);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setMutationBanner('This board changed elsewhere — refreshed.');
        await refetch();
      } else if (e instanceof ApiError && e.status === 422) {
        setMutationBanner(e.problem.detail ?? 'That date change is not allowed.');
        await refetch();
      } else {
        setMutationBanner('Could not change the delivery date. Please try again.');
      }
    } finally {
      setPendingOrderId(null);
      setChangeDateOrderId(null);
    }
  }

  // Same arrayMove-based resequencing as RunColumn's own Move up/down —
  // the list view acts on a run it doesn't render as a column, so it needs
  // the source run's current card order from the board itself.
  function handleListMoveUpDown(row: DeliveryListRow, direction: 'up' | 'down') {
    if (!board || !row.runId) return;
    const run = board.runs.find((r) => r.runId === row.runId);
    if (!run) return;
    const orderIds = run.cards.map((c) => c.orderId);
    const index = orderIds.indexOf(row.card.orderId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || targetIndex < 0 || targetIndex >= orderIds.length) return;
    handleReorder(run.runId, arrayMove(orderIds, index, targetIndex));
  }

  const isEmpty = board && board.runs.every((r) => r.cards.length === 0) && board.unassigned.length === 0;

  return (
    <>
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <ListPageHeader
          title="Delivery Runs"
          className="mb-4"
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <DeliveryDateRangeControl
                weekStart={weekStart}
                weekEnd={weekEnd}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
              />
              {/* Filters only actually affect what's rendered when List is the
                  visible view — either viewMode === 'list', or Board is CSS-forced
                  to List below md (see the board/list rendering below). Hide the
                  filters exactly when Board is what's showing (viewMode === 'board'
                  at md+) so this control isn't a dead no-op there. Board itself
                  keeps rendering unconditionally regardless (decision #2 in the
                  delivery-planning-pbi-plan decisions log) — this is a page-level
                  visibility change only, not a reversal of that decision. */}
              <div data-testid="board-filters" className={viewMode === 'board' ? 'md:hidden' : undefined}>
                <DeliveryBoardFilters filter={attentionFilter} onChange={setAttentionFilter} />
              </div>
              {/* Below md, Board is always CSS-forced to List regardless of
                  this toggle (see the board/list rendering below), so the
                  toggle itself would be a dead control on phones — hide it
                  at the same breakpoint that forces List, and only show it
                  once Board actually renders (tablet and up). */}
              <div className="hidden md:inline-flex">
                <BoardViewToggle mode={viewMode} onChange={setViewMode} />
              </div>
            </div>
          )}
        />

        <WorkloadStrip
          token={accessToken}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
          weekStart={weekStart}
          onWeekStartChange={setWeekStart}
          refreshKey={workloadRefreshKey}
        />
        <UndatedDeliveriesPanel token={accessToken} />

        {mutationBanner && (
          <div className="mb-4">
            <ListErrorBanner message={mutationBanner} />
          </div>
        )}

        {isLoading ? (
          <ListSpinner />
        ) : error ? (
          <ListErrorBanner message={error} />
        ) : !board ? null : isEmpty ? (
          <DeliveryRunsEmptyState />
        ) : (
          <div className={`flex min-h-0 flex-1 flex-col ${isRefreshing ? 'opacity-60' : ''}`}>
            {viewMode === 'list' ? (
              <div data-testid="list-view">
                <DeliveryRunList
                  board={board}
                  pendingOrderId={pendingOrderId}
                  pendingRunId={pendingRunId}
                  filterUnassignedOnly={attentionFilter === 'unassigned'}
                  filterMissedOnly={attentionFilter === 'missed'}
                  onMove={handleMove}
                  onMoveUpDown={handleListMoveUpDown}
                  onMarkReady={handleMarkReady}
                  onReopen={handleReopen}
                  onSetDriver={handleSetDriver}
                  onChangeDate={setChangeDateOrderId}
                />
              </div>
            ) : (
              <>
                {/* Board view is the default on md+ screens. Below md it's
                    forced to List regardless of the toggle — both are
                    mounted and CSS decides which one shows, matching
                    MobileCardList's own self-md:hidden convention rather
                    than tracking the breakpoint in JS. (Both surfaces exist
                    in the DOM at once, same as MobileCardList's own table +
                    list pairing — tests scope queries with within(), same
                    convention as AccountingContactsTable.spec.tsx.) */}
                <div data-testid="board-view" className="hidden min-h-0 flex-1 flex-col md:flex">
                  <DeliveryRunBoard
                    board={board}
                    pendingOrderId={pendingOrderId}
                    pendingRunId={pendingRunId}
                    onMove={handleMove}
                    onReorder={handleReorder}
                    onMarkReady={handleMarkReady}
                    onReopen={handleReopen}
                    onSetDriver={handleSetDriver}
                    onChangeDate={setChangeDateOrderId}
                  />
                </div>
                <div data-testid="list-view" className="md:hidden">
                  <DeliveryRunList
                    board={board}
                    pendingOrderId={pendingOrderId}
                    pendingRunId={pendingRunId}
                    filterUnassignedOnly={attentionFilter === 'unassigned'}
                    filterMissedOnly={attentionFilter === 'missed'}
                    onMove={handleMove}
                    onMoveUpDown={handleListMoveUpDown}
                    onMarkReady={handleMarkReady}
                    onReopen={handleReopen}
                    onSetDriver={handleSetDriver}
                    onChangeDate={setChangeDateOrderId}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {changeDateOrderId && (() => {
        const card = findCard(changeDateOrderId);
        if (!card) return null;
        return (
          <ChangeDeliveryDateDialog
            token={accessToken}
            orderId={card.orderId}
            orderNumber={card.orderNumber}
            customerName={card.customerName}
            currentScheduledDeliveryDate={card.scheduledDeliveryDate}
            requestedDeliveryDate={card.requestedDeliveryDate}
            submitting={pendingOrderId === card.orderId}
            onCancel={() => setChangeDateOrderId(null)}
            onConfirm={(params) => handleChangeDeliveryDate(card.orderId, params)}
          />
        );
      })()}
    </>
  );
}
