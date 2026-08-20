'use client';

import { useEffect, useState } from 'react';
import type { NearbyDelivery, ReschedulePreviewResponse } from '@wholo/types';
import { adminDeliveryRunsApi } from '@wholo/admin-api-client';
import { Modal } from '@/components/Modal';
import { TextInput } from '@/components/form/TextInput';
import { formatShortDate, unallocatedReasonCopy } from './attention';

interface Props {
  token: string | null | undefined;
  orderId: string;
  orderNumber: string;
  customerName: string;
  // null covers the undated-deliveries case (UndatedDeliveriesPanel) — an
  // order that has never had a scheduled date yet.
  currentScheduledDeliveryDate: string | null;
  requestedDeliveryDate: string | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (params: { scheduledDeliveryDate: string; expectedScheduledDeliveryDate: string | null }) => void;
}

const PREVIEW_DEBOUNCE_MS = 400;

function resolutionCopy(resolution: ReschedulePreviewResponse['resolution']): string {
  if (!resolution.allocated) return unallocatedReasonCopy(resolution.reason);
  return resolution.runId ? `Will move to ${resolution.runName}` : `Will create ${resolution.runName}'s run for this date`;
}

// Single-screen — no wizard. Content stacks in escalating order of alarm
// (context → drift note → resolution preview → nearby-address panel) so the
// common case (no drift, no address collision) stays as light as
// MarkReadyDialog/ReopenConfirm; the heavier cases only appear when relevant.
export function ChangeDeliveryDateDialog({
  token, orderId, orderNumber, customerName, currentScheduledDeliveryDate, requestedDeliveryDate,
  submitting, onCancel, onConfirm,
}: Props) {
  const [date, setDate] = useState(currentScheduledDeliveryDate ?? '');
  const [preview, setPreview] = useState<ReschedulePreviewResponse | null>(null);

  useEffect(() => {
    if (!token || !date) {
      setPreview(null);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      adminDeliveryRunsApi.getReschedulePreview(token, orderId, date, controller.signal)
        .then(setPreview)
        .catch(() => setPreview(null)); // informational only — a failed preview never blocks Save
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [token, orderId, date]);

  const unchanged = date === (currentScheduledDeliveryDate ?? '');
  const isDrift = !unchanged && requestedDeliveryDate != null && date !== requestedDeliveryDate;
  const blockedReason = preview && !preview.resolution.allocated && preview.resolution.reason === 'RUN_READY'
    ? 'Run already marked ready'
    : null;
  const nearbyDeliveries: NearbyDelivery[] = preview?.nearbyDeliveries ?? [];

  return (
    <Modal onClose={onCancel} labelledBy="change-delivery-date-title" closable={!submitting}>
      <h3 id="change-delivery-date-title" className="text-base font-semibold text-text">
        Change delivery date
      </h3>
      <p className="mt-1 truncate text-sm text-muted">{customerName} · {orderNumber}</p>

      <label htmlFor="change-delivery-date-input" className="mt-4 block text-sm font-medium text-text">
        New delivery date
      </label>
      <TextInput
        id="change-delivery-date-input"
        type="date"
        value={date}
        disabled={submitting}
        onChange={(e) => setDate(e.target.value)}
        className="mt-1"
      />
      {requestedDeliveryDate && (
        <p className="mt-1 text-xs text-muted">Originally requested: {formatShortDate(requestedDeliveryDate)}</p>
      )}

      {isDrift && (
        <p className="mt-2 text-xs text-amber-800">
          ⚠ Differs from the customer&rsquo;s requested date ({formatShortDate(requestedDeliveryDate!)})
        </p>
      )}

      {date && preview && (
        <p className={`mt-2 text-xs ${blockedReason ? 'text-amber-800' : 'text-muted'}`}>
          {resolutionCopy(preview.resolution)}
        </p>
      )}

      {nearbyDeliveries.length > 0 && (
        <div className="mt-3 rounded-md border border-border bg-canvas p-2.5">
          <p className="text-xs font-medium text-text">Other deliveries at this address</p>
          <ul className="mt-1.5 space-y-1">
            {nearbyDeliveries.map((d) => (
              <li key={d.orderId} className="flex items-center justify-between gap-2 text-xs text-muted">
                <span className="truncate">{d.customerName} · {d.orderNumber}</span>
                <span className="shrink-0">{d.scheduledDeliveryDate ? formatShortDate(d.scheduledDeliveryDate) : '—'}</span>
              </li>
            ))}
          </ul>
        </div>
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
          onClick={() => onConfirm({ scheduledDeliveryDate: date, expectedScheduledDeliveryDate: currentScheduledDeliveryDate })}
          disabled={submitting || unchanged || !date || !!blockedReason}
          title={blockedReason ?? undefined}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save date'}
        </button>
      </div>
    </Modal>
  );
}
