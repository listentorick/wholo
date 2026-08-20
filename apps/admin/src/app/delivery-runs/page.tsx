'use client';

import { useState } from 'react';
import { adminDeliveryRunsApi, ApiError } from '@wholo/admin-api-client';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { ListPageHeader } from '@/components/list/ListPageHeader';
import { ListSpinner } from '@/components/list/ListSpinner';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { useDeliveryDay } from '@/lib/hooks/use-delivery-day';
import { toIso } from '@/lib/date';
import { WorkloadStrip } from '@/components/delivery-runs/WorkloadStrip';
import { BoardViewToggle, type BoardViewMode } from '@/components/delivery-runs/BoardViewToggle';
import { DeliveryRunBoard } from '@/components/delivery-runs/DeliveryRunBoard';

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
  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => toIso(new Date()));
  const [viewMode, setViewMode] = useState<BoardViewMode>('board');
  const [mutationBanner, setMutationBanner] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const {
    board, isLoading, isRefreshing, error, refetch, mutate,
  } = useDeliveryDay(accessToken, selectedDate);

  // Mutation flow: never auto-retry a 409 — the board the user acted on no
  // longer exists, so the only correct move is a fresh re-GET.
  async function handleMove(orderId: string, fromRunId: string | null, toRunId: string | null) {
    if (!board || !accessToken) return;
    setPendingOrderId(orderId);
    setMutationBanner(null);
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
    setMutationBanner(null);
    try {
      const refreshed = await adminDeliveryRunsApi.reorderRunOrders(accessToken, runId, { version: run.version, orderedOrderIds });
      mutate(refreshed);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setMutationBanner('This board changed elsewhere — refreshed.');
        await refetch();
      } else {
        setMutationBanner('Could not reorder the run. Please try again.');
      }
    }
  }

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  const isEmpty = board && board.runs.every((r) => r.cards.length === 0) && board.unassigned.length === 0;

  return (
    <AdminLayout>
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <ListPageHeader
          title="Delivery Runs"
          className="mb-4"
          actions={<BoardViewToggle mode={viewMode} onChange={setViewMode} />}
        />

        <WorkloadStrip token={accessToken} selectedDate={selectedDate} onSelectDate={setSelectedDate} />

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
        ) : viewMode === 'list' ? (
          <ListEmptyState
            icon={<span className="text-2xl" aria-hidden>☰</span>}
            title="List view is coming soon"
            description="Use the board view for now — a table view is on the way."
          />
        ) : (
          <div className={`flex min-h-0 flex-1 flex-col ${isRefreshing ? 'opacity-60' : ''}`}>
            <DeliveryRunBoard
              board={board}
              pendingOrderId={pendingOrderId}
              onMove={handleMove}
              onReorder={handleReorder}
            />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
