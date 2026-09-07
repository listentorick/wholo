'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DeliveryRouteSummary } from '@wholo/types';
import { adminDeliveryRoutesApi } from '@wholo/admin-api-client';
import { Modal } from '@/components/Modal';
import { SelectInput } from '@/components/form/SelectInput';
import { formatShortDate } from './attention';

interface Props {
  // routeIds that already have a run on the selected day — filtered out of
  // the picker, since a route can only have one run per day.
  existingRouteIds: string[];
  selectedDate: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (routeId: string) => void;
}

// "Plan a run" — creates the empty run for a route that no accepted order
// has populated yet on this day. Same Modal + footer shape as
// MarkReadyDialog / ChangeDeliveryDateDialog.
export function CreateRunDialog({
  existingRouteIds, selectedDate, submitting, onCancel, onConfirm,
}: Props) {
  const [routes, setRoutes] = useState<DeliveryRouteSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [routeId, setRouteId] = useState('');

  useEffect(() => {
    let cancelled = false;
    adminDeliveryRoutesApi.list({ active: true, limit: 100 })
      .then((res) => { if (!cancelled) setRoutes(res.data); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, []);

  const available = (routes ?? []).filter((r) => !existingRouteIds.includes(r.id));
  const noRoutes = routes !== null && routes.length === 0;
  const allRoutesUsed = routes !== null && routes.length > 0 && available.length === 0;
  const deadEnd = noRoutes || allRoutesUsed;

  return (
    <Modal onClose={onCancel} labelledBy="create-run-title" closable={!submitting}>
      <h3 id="create-run-title" className="text-base font-semibold text-text">Plan a run</h3>
      <p className="mt-1 text-sm text-muted">
        Add an empty run for {formatShortDate(selectedDate)}, then move deliveries into it.
      </p>

      {loadError ? (
        <p className="mt-4 text-sm text-amber-800">Could not load routes. Close and try again.</p>
      ) : routes === null ? (
        <p className="mt-4 text-sm text-muted">Loading routes…</p>
      ) : noRoutes ? (
        <p className="mt-4 text-sm text-muted">
          You don&rsquo;t have any active delivery routes yet.{' '}
          <Link href="/delivery-routes/new" className="font-medium text-primary hover:underline">
            Create a route
          </Link>
        </p>
      ) : allRoutesUsed ? (
        <p className="mt-4 text-sm text-muted">
          Every active route already has a run on this day.{' '}
          <Link href="/delivery-routes" className="font-medium text-primary hover:underline">
            Manage routes
          </Link>
        </p>
      ) : (
        <>
          <label htmlFor="create-run-route" className="mt-4 block text-sm font-medium text-text">
            Route
          </label>
          {/* SelectInput spreads props after its own className, so a passed
              className clobbers its styling — wrap for spacing instead. */}
          <div className="mt-1">
            <SelectInput
              id="create-run-route"
              value={routeId}
              disabled={submitting}
              onChange={(e) => setRouteId(e.target.value)}
            >
              <option value="" disabled>Select a route…</option>
              {available.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.code ? ` (${r.code})` : ''}
                </option>
              ))}
            </SelectInput>
          </div>
          <p className="mt-2 text-xs text-muted">
            The route&rsquo;s default driver carries over — you can change it on the board.
          </p>
        </>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          data-modal-cancel
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(routeId)}
          disabled={submitting || !routeId || deadEnd}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Adding…' : 'Add run'}
        </button>
      </div>
    </Modal>
  );
}
