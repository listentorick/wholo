'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useCursorList } from '@/lib/hooks/use-cursor-list';
import { DetailPageHeader } from '@/components/detail/DetailPageHeader';
import { DetailPageLayout } from '@/components/detail/DetailPageLayout';
import { DetailActionsPanel, type ActionItem } from '@/components/detail/DetailActionsPanel';
import { OrderInvoiceExportBadge } from '@/components/orders/OrderInvoiceExportBadge';
import { TaxTypeUnmappedWarningModal } from '@/components/orders/TaxTypeUnmappedWarningModal';
import { adminOrdersApi, ApiError } from '@wholo/admin-api-client';
import type { Order, OrderLine, AuditLogEntry, AuditLogQueryParams } from '@wholo/types';
import { OrderStatus, AcceptedByActorType, ActorType, formatMoney } from '@wholo/types';
import { CLASSIFICATION_LABELS } from '@/lib/tax-classification-labels';

// ─── Tax label ──────────────────────────────────────────────────────────────

function taxLabel(line: OrderLine): string {
  if (!line.taxTypeNameSnapshot) return '—';
  const classification = line.taxClassificationSnapshot
    ? CLASSIFICATION_LABELS[line.taxClassificationSnapshot]
    : null;
  const rate = line.taxRatePercentageSnapshot != null ? `${parseFloat(line.taxRatePercentageSnapshot)}%` : classification;
  return rate ? `${line.taxTypeNameSnapshot} (${rate})` : line.taxTypeNameSnapshot;
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; text: string; border: string }> = {
  [OrderStatus.SUBMITTED]:        { label: 'Pending',        bg: '#fef3ec', text: '#d97036', border: '#fddcbe' },
  [OrderStatus.ACCEPTED]:         { label: 'Accepted',       bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
  [OrderStatus.REJECTED]:         { label: 'Rejected',       bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' },
  [OrderStatus.CANCELLED]:        { label: 'Cancelled',      bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
  [OrderStatus.COMPLETED]:        { label: 'Completed',      bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe' },
  [OrderStatus.DELIVERED]:        { label: 'Delivered',      bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
  [OrderStatus.DELIVERY_FAILED]:  { label: 'Delivery failed', bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtAmt(amount: string, currency: string) {
  return formatMoney(amount, currency);
}

// Date-only strings (e.g. requestedDeliveryDate = "2026-08-09") parse as UTC midnight,
// which can render a day early in timezones behind UTC — pad to local midnight instead.
function fmtDeliveryDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ─── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{children}</p>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_META[status] ?? STATUS_META[OrderStatus.CANCELLED];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.text }} />
      {s.label}
    </span>
  );
}

// ─── Reject modal ──────────────────────────────────────────────────────────────

interface ReasonModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}

/** Matches DetailActionsPanel's own destructive-confirm button styling, duplicated
 *  locally since those class strings aren't exported (single consumer here). */
const DANGER_CONFIRM_CLS =
  'rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50';

function ReasonModal({ title, description, confirmLabel, onConfirm, onCancel }: ReasonModalProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!reason.trim()) { setErr('Please provide a reason.'); return; }
    setBusy(true);
    setErr(null);
    try {
      await onConfirm(reason.trim());
    } catch {
      setErr('Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-lg">
        <h3 className="text-base font-semibold text-text">{title}</h3>
        <p className="mb-4 mt-1.5 text-sm text-muted">{description}</p>
        <textarea
          className="w-full rounded-md border border-border px-3 py-2 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none resize-none"
          rows={3}
          placeholder="Enter reason…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        {err && <p className="mt-1.5 text-xs text-red-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !reason.trim()}
            className={DANGER_CONFIRM_CLS}
          >
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm modal (no reason field — used for Accept) ─────────────────────────

interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Matches DetailActionsPanel's own primary-confirm button styling, duplicated
 *  locally since those class strings aren't exported (single consumer here). */
const PRIMARY_CONFIRM_CLS =
  'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50';

function ConfirmModal({ title, description, confirmLabel, busy, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-lg">
        <h3 className="text-base font-semibold text-text">{title}</h3>
        <p className="mt-1.5 text-sm text-muted">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:opacity-50"
          >
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={PRIMARY_CONFIRM_CLS}>
            {busy ? 'Accepting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const { accessToken } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accepting, setAccepting] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [unmappedTaxDetail, setUnmappedTaxDetail] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  // Bumped after every successful accept/reject/cancel to force the audit
  // log to refetch — otherwise the Timeline would only ever show its
  // initial-mount snapshot and miss the very event that just happened.
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    adminOrdersApi.getOrder(orderId, accessToken)
      .then(setOrder)
      .catch(() => setError('Order not found or could not be loaded'))
      .finally(() => setLoading(false));
  }, [accessToken, orderId]);

  const auditLog = useCursorList<AuditLogEntry, AuditLogQueryParams>({
    token: accessToken,
    fetchPage: (token, params) => adminOrdersApi.getOrderAuditLog(orderId, params, token),
    buildParams: (cursor) => ({ limit: 30, cursor }),
    errorMessage: 'Could not load activity',
    deps: [auditRefreshKey],
  });

  const handleAccept = async (confirmUnmappedTaxTypes = false) => {
    if (!accessToken || accepting) return;
    setAccepting(true);
    try {
      const updated = await adminOrdersApi.acceptOrder(orderId, accessToken, { confirmUnmappedTaxTypes });
      setOrder(updated);
      setAuditRefreshKey((k) => k + 1);
      setShowAcceptModal(false);
      setUnmappedTaxDetail(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.problem.title === 'TAX_TYPE_UNMAPPED') {
        setUnmappedTaxDetail(err.problem.detail ?? 'One or more tax types are unmapped.');
        return;
      }
      throw err;
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!accessToken) return;
    const updated = await adminOrdersApi.rejectOrder(orderId, { reason }, accessToken);
    setOrder(updated);
    setAuditRefreshKey((k) => k + 1);
    setShowRejectModal(false);
  };

  const handleCancel = async (reason: string) => {
    if (!accessToken) return;
    const updated = await adminOrdersApi.cancelOrder(orderId, { reason }, accessToken);
    setOrder(updated);
    setAuditRefreshKey((k) => k + 1);
    setShowCancelModal(false);
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      </>
    );
  }

  if (error || !order) {
    return (
      <>
        <div className="mb-5">
          <Link href="/orders" className="text-sm text-muted hover:text-text transition-colors">
            ← Back to orders
          </Link>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error ?? 'Order not found'}
        </div>
      </>
    );
  }

  const sc = STATUS_META[order.status] ?? STATUS_META[OrderStatus.CANCELLED];
  const delivAddr = order.deliveryAddressSnapshot;
  const billAddr = order.billingAddressSnapshot;
  const hasDelivAddr = delivAddr && Object.values(delivAddr).some(Boolean);
  const hasBillAddr = billAddr && Object.values(billAddr).some(Boolean);

  const canAccept = order.status === OrderStatus.SUBMITTED;
  const canReject = order.status === OrderStatus.SUBMITTED;
  const canCancel = order.status === OrderStatus.SUBMITTED || order.status === OrderStatus.ACCEPTED;

  const actions: ActionItem[] = [
    ...(canAccept
      ? ([
          {
            key: 'accept',
            label: 'Accept order',
            tone: 'primary',
            loading: accepting,
            loadingLabel: 'Accepting…',
            onClick: () => setShowAcceptModal(true),
          },
        ] satisfies ActionItem[])
      : []),
    ...(canReject
      ? ([{ key: 'reject', label: 'Reject order', tone: 'danger', onClick: () => setShowRejectModal(true) }] satisfies ActionItem[])
      : []),
    ...(canCancel
      ? ([{ key: 'cancel', label: 'Cancel order', tone: 'danger', onClick: () => setShowCancelModal(true) }] satisfies ActionItem[])
      : []),
  ];

  return (
    <>
      {showAcceptModal && canAccept && (
        <ConfirmModal
          title="Accept order"
          description="This marks the order as accepted and notifies the customer — it moves into fulfilment."
          confirmLabel="Yes, accept"
          busy={accepting}
          onConfirm={() => handleAccept()}
          onCancel={() => setShowAcceptModal(false)}
        />
      )}
      {unmappedTaxDetail && (
        <TaxTypeUnmappedWarningModal
          detail={unmappedTaxDetail}
          submitting={accepting}
          onCancel={() => setUnmappedTaxDetail(null)}
          onConfirm={() => handleAccept(true)}
        />
      )}
      {showRejectModal && (
        <ReasonModal
          title="Reject this order?"
          description="The order hasn't been accepted yet — rejecting it lets the customer know they'll need to submit a new order if they still want these items."
          confirmLabel="Reject order"
          onConfirm={handleReject}
          onCancel={() => setShowRejectModal(false)}
        />
      )}
      {showCancelModal && (
        <ReasonModal
          title="Cancel this order?"
          description="Use this for orders that can no longer be fulfilled, even after acceptance — for example if stock fell through. The customer will be notified."
          confirmLabel="Cancel order"
          onConfirm={handleCancel}
          onCancel={() => setShowCancelModal(false)}
        />
      )}

      <DetailPageHeader
        backHref="/orders"
        backLabel="Orders"
        heading={
          <>
            {order.orderNumber}
            <span className="block mt-0.5 text-sm font-normal text-muted">
              Submitted {fmtDate(order.submittedAt ?? order.createdAt)}
            </span>
          </>
        }
        badge={<StatusBadge status={order.status} />}
      />

      <DetailPageLayout
        sidebar={
          <div className="flex flex-col gap-5">
            {(hasDelivAddr || order.requestedDeliveryDate) && (
              <div className="order-1 lg:order-2 rounded-lg border border-border bg-white px-5 py-4">
                <SectionLabel>Delivery</SectionLabel>
                {order.requestedDeliveryDate && (
                  <p className="text-sm text-text">
                    <span className="font-medium">Requested: </span>
                    {fmtDeliveryDate(order.requestedDeliveryDate)}
                  </p>
                )}
                {hasDelivAddr && (
                  <p className={`text-sm text-text leading-relaxed ${order.requestedDeliveryDate ? 'mt-2' : ''}`}>
                    {[delivAddr!.line1, delivAddr!.line2, delivAddr!.city, delivAddr!.state, delivAddr!.postcode, delivAddr!.country]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
              </div>
            )}

            {hasBillAddr && (
              <div className="order-2 lg:order-3 rounded-lg border border-border bg-white px-5 py-4">
                <SectionLabel>Billing Address</SectionLabel>
                <p className="text-sm text-text leading-relaxed">
                  {[billAddr!.line1, billAddr!.line2, billAddr!.city, billAddr!.state, billAddr!.postcode, billAddr!.country]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
            )}

            {/* Timeline — driven by the audit log, oldest first (reversed from the API's newest-first cursor order) */}
            <div className="order-3 lg:order-4 rounded-lg border border-border bg-white px-5 py-4">
              <SectionLabel>Timeline</SectionLabel>
              <div className="flex flex-col gap-3">
                {auditLog.data.length === 0 && !auditLog.isLoading && (
                  <p className="text-xs text-muted">No activity yet.</p>
                )}
                {auditLog.error && <p className="text-xs text-red-600">{auditLog.error}</p>}
                {[...auditLog.data].reverse().map((entry) => (
                  <TimelineEntryRow key={entry.id} entry={entry} />
                ))}
              </div>
            </div>

            {actions.length > 0 && (
              <div className="order-4 lg:order-1">
                <DetailActionsPanel layout="sidebar" actions={actions} />
              </div>
            )}
          </div>
        }
      >

          {/* Status banner */}
          <div
            className="rounded-lg border px-5 py-4"
            style={{ background: sc.bg, borderColor: sc.border }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: sc.text }}>
              {sc.label}
            </p>
            <p className="mt-1 text-sm" style={{ color: sc.text, opacity: 0.85 }}>
              {order.status === OrderStatus.SUBMITTED && 'Awaiting your review'}
              {order.status === OrderStatus.ACCEPTED && (
                <>Accepted {fmtDateTime(order.acceptedAt)}
                  {order.acceptedByActorType === AcceptedByActorType.SYSTEM && ' (auto-accepted)'}
                </>
              )}
              {order.status === OrderStatus.REJECTED && (
                <>Rejected {fmtDateTime(order.rejectedAt)}{order.rejectionReason ? ` — ${order.rejectionReason}` : ''}</>
              )}
              {order.status === OrderStatus.CANCELLED && (
                <>Cancelled {fmtDateTime(order.cancelledAt)}{order.cancellationReason ? ` — ${order.cancellationReason}` : ''}</>
              )}
            </p>
            {canAccept && (
              <button
                type="button"
                onClick={() => setShowAcceptModal(true)}
                disabled={accepting}
                className="mt-3 w-full md:hidden rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {accepting ? 'Accepting…' : 'Accept order'}
              </button>
            )}
          </div>

          {/* Customer */}
          <div className="rounded-lg border border-border bg-white px-5 py-4">
            <SectionLabel>Customer</SectionLabel>
            <p className="text-sm font-medium text-text">
              {order.traderCustomer?.name ?? 'Unknown'}
            </p>
            {(order.customerReference || order.notes) && (
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                {order.customerReference && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">PO Ref</p>
                    <p className="mt-0.5 text-sm text-text">{order.customerReference}</p>
                  </div>
                )}
                {order.notes && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Notes</p>
                    <p className="mt-0.5 text-sm text-text">{order.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Accounting invoice export state */}
          {order.invoiceExport && accessToken && (
            <OrderInvoiceExportBadge invoiceExport={order.invoiceExport} token={accessToken} />
          )}

          {/* Order lines */}
          <div className="rounded-lg border border-border bg-white overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <SectionLabel>Products</SectionLabel>
            </div>

            {/* Mobile card list */}
            <ul className="divide-y divide-border md:hidden">
              {order.lines.map((line) => (
                <li key={line.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text break-words">{line.productNameSnapshot}</p>
                    {line.unitOfMeasureSnapshot && (
                      <p className="text-xs text-muted">{line.unitOfMeasureSnapshot}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted">
                      {line.skuSnapshot ?? '—'} · {line.quantityOrdered} × {fmtAmt(line.unitPriceSnapshot, order.currency)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">Tax: {taxLabel(line)}</p>
                  </div>
                  <p className="flex-shrink-0 text-sm font-semibold tabular-nums text-text">{fmtAmt(line.totalAmount, order.currency)}</p>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[680px] text-left">
                <thead className="border-b border-border bg-[#fafafa]">
                  <tr>
                    <th className="py-2 pl-5 pr-4 text-xs font-semibold uppercase tracking-wide text-muted">Product</th>
                    <th className="py-2 px-4 text-xs font-semibold uppercase tracking-wide text-muted">SKU</th>
                    <th className="py-2 px-4 text-xs font-semibold uppercase tracking-wide text-muted text-right">Qty</th>
                    <th className="py-2 px-4 text-xs font-semibold uppercase tracking-wide text-muted text-right">Unit price</th>
                    <th className="py-2 px-4 text-xs font-semibold uppercase tracking-wide text-muted">Tax</th>
                    <th className="py-2 pl-4 pr-5 text-xs font-semibold uppercase tracking-wide text-muted text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line, i) => (
                    <tr key={line.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-[#fafafa]' : ''}`}>
                      <td className="py-3 pl-5 pr-4">
                        <p className="text-sm font-medium text-text">{line.productNameSnapshot}</p>
                        {line.unitOfMeasureSnapshot && (
                          <p className="text-xs text-muted">{line.unitOfMeasureSnapshot}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-muted">{line.skuSnapshot ?? '—'}</td>
                      <td className="py-3 px-4 text-sm text-text text-right">{line.quantityOrdered}</td>
                      <td className="py-3 px-4 text-sm text-text text-right">{fmtAmt(line.unitPriceSnapshot, order.currency)}</td>
                      <td className="py-3 px-4 text-sm text-muted">{taxLabel(line)}</td>
                      <td className="py-3 pl-4 pr-5 text-sm font-medium text-text text-right">{fmtAmt(line.totalAmount, order.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Totals */}
            <div className="border-t border-border px-5 py-4">
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex w-48 justify-between text-sm text-muted">
                  <span>Subtotal</span>
                  <span>{fmtAmt(order.subtotalAmount, order.currency)}</span>
                </div>
                <div className="flex w-48 justify-between text-sm text-muted">
                  <span>Tax</span>
                  <span>{fmtAmt(order.taxAmount, order.currency)}</span>
                </div>
                <div className="mt-1 flex w-48 justify-between border-t border-border pt-2">
                  <span className="text-sm font-semibold text-text">Total</span>
                  <span className="text-sm font-semibold text-text">{fmtAmt(order.totalAmount, order.currency)}</span>
                </div>
              </div>
            </div>
          </div>

      </DetailPageLayout>
    </>
  );
}

function TimelineEntryRow({ entry }: { entry: AuditLogEntry }) {
  const actor = entry.actorName ?? (entry.actorType === ActorType.SYSTEM ? 'System' : null);
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
      <div>
        <p className="text-xs font-medium text-text">{entry.summary}</p>
        <p className="text-xs text-muted">{fmtDateTime(entry.createdAt)}</p>
        {actor && <p className="text-xs text-muted">{actor}</p>}
      </div>
    </div>
  );
}
