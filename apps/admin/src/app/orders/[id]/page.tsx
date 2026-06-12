'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { adminOrdersApi } from '@wholo/admin-api-client';
import type { Order } from '@wholo/types';
import { OrderStatus, AcceptedByActorType } from '@wholo/types';

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; text: string; border: string }> = {
  [OrderStatus.SUBMITTED]:  { label: 'Pending',   bg: '#fef3ec', text: '#d97036', border: '#fddcbe' },
  [OrderStatus.ACCEPTED]:   { label: 'Accepted',  bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
  [OrderStatus.REJECTED]:   { label: 'Rejected',  bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' },
  [OrderStatus.CANCELLED]:  { label: 'Cancelled', bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
  [OrderStatus.COMPLETED]:  { label: 'Completed', bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe' },
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

function fmtAmt(amount: string) {
  return `£${parseFloat(amount).toFixed(2)}`;
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
  confirmLabel: string;
  confirmStyle: React.CSSProperties;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}

function ReasonModal({ title, confirmLabel, confirmStyle, onConfirm, onCancel }: ReasonModalProps) {
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
        <h3 className="mb-4 text-base font-semibold text-text">{title}</h3>
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
            className="rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={confirmStyle}
          >
            {busy ? 'Saving…' : confirmLabel}
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

  const { isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accepting, setAccepting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    adminOrdersApi.getOrder(orderId, accessToken)
      .then(setOrder)
      .catch(() => setError('Order not found or could not be loaded'))
      .finally(() => setLoading(false));
  }, [accessToken, orderId]);

  const handleAccept = async () => {
    if (!accessToken || accepting) return;
    setAccepting(true);
    try {
      const updated = await adminOrdersApi.acceptOrder(orderId, accessToken);
      setOrder(updated);
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!accessToken) return;
    const updated = await adminOrdersApi.rejectOrder(orderId, { reason }, accessToken);
    setOrder(updated);
    setShowRejectModal(false);
  };

  const handleCancel = async (reason: string) => {
    if (!accessToken) return;
    const updated = await adminOrdersApi.cancelOrder(orderId, { reason }, accessToken);
    setOrder(updated);
    setShowCancelModal(false);
  };

  if (authLoading || loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !order) {
    return (
      <AdminLayout>
        <div className="mb-5">
          <Link href="/orders" className="text-sm text-muted hover:text-text transition-colors">
            ← Back to orders
          </Link>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error ?? 'Order not found'}
        </div>
      </AdminLayout>
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

  return (
    <AdminLayout>
      {showRejectModal && (
        <ReasonModal
          title="Reject this order?"
          confirmLabel="Reject Order"
          confirmStyle={{ background: '#b91c1c' }}
          onConfirm={handleReject}
          onCancel={() => setShowRejectModal(false)}
        />
      )}
      {showCancelModal && (
        <ReasonModal
          title="Cancel this order?"
          confirmLabel="Cancel Order"
          confirmStyle={{ background: '#6b7280' }}
          onConfirm={handleCancel}
          onCancel={() => setShowCancelModal(false)}
        />
      )}

      {/* Back nav */}
      <div className="mb-5 flex items-center justify-between">
        <Link href="/orders" className="text-sm text-muted hover:text-text transition-colors">
          ← Back to orders
        </Link>
        <StatusBadge status={order.status} />
      </div>

      {/* Page heading */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">{order.orderNumber}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Submitted {fmtDate(order.submittedAt ?? order.createdAt)}
          </p>
        </div>

        {/* Action panel */}
        {(canAccept || canCancel) && (
          <div className="flex items-center gap-2 pt-0.5">
            {canAccept && (
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting}
                className="rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
                style={{ background: '#15803d' }}
              >
                {accepting ? 'Accepting…' : 'Accept Order'}
              </button>
            )}
            {canReject && (
              <button
                type="button"
                onClick={() => setShowRejectModal(true)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                style={{ color: '#b91c1c' }}
              >
                Reject
              </button>
            )}
            {canCancel && !canReject && (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                Cancel Order
              </button>
            )}
            {canCancel && canReject && (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">

        {/* ── Left column (2/3) ── */}
        <div className="lg:col-span-2 flex flex-col gap-5">

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
          </div>

          {/* Order lines */}
          <div className="rounded-lg border border-border bg-white overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <SectionLabel>Products</SectionLabel>
            </div>
            <table className="w-full text-left">
              <thead className="border-b border-border bg-[#fafafa]">
                <tr>
                  <th className="py-2 pl-5 pr-4 text-xs font-semibold uppercase tracking-wide text-muted">Product</th>
                  <th className="py-2 px-4 text-xs font-semibold uppercase tracking-wide text-muted">SKU</th>
                  <th className="py-2 px-4 text-xs font-semibold uppercase tracking-wide text-muted text-right">Qty</th>
                  <th className="py-2 px-4 text-xs font-semibold uppercase tracking-wide text-muted text-right">Unit price</th>
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
                    <td className="py-3 px-4 text-sm text-text text-right">{fmtAmt(line.unitPriceSnapshot)}</td>
                    <td className="py-3 pl-4 pr-5 text-sm font-medium text-text text-right">{fmtAmt(line.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Totals */}
            <div className="border-t border-border px-5 py-4">
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex w-48 justify-between text-sm text-muted">
                  <span>Subtotal</span>
                  <span>{fmtAmt(order.subtotalAmount)}</span>
                </div>
                <div className="flex w-48 justify-between text-sm text-muted">
                  <span>Tax</span>
                  <span>{fmtAmt(order.taxAmount)}</span>
                </div>
                <div className="mt-1 flex w-48 justify-between border-t border-border pt-2">
                  <span className="text-sm font-semibold text-text">Total</span>
                  <span className="text-sm font-semibold text-text">{fmtAmt(order.totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ── Right column (1/3) ── */}
        <div className="flex flex-col gap-5">

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

          {/* Timeline */}
          <div className="rounded-lg border border-border bg-white px-5 py-4">
            <SectionLabel>Timeline</SectionLabel>
            <div className="flex flex-col gap-3">
              <TimelineRow label="Submitted" date={order.submittedAt} />
              {order.acceptedAt && (
                <TimelineRow
                  label={order.acceptedByActorType === AcceptedByActorType.SYSTEM ? 'Auto-accepted' : 'Accepted'}
                  date={order.acceptedAt}
                />
              )}
              {order.rejectedAt && <TimelineRow label="Rejected" date={order.rejectedAt} />}
              {order.cancelledAt && <TimelineRow label="Cancelled" date={order.cancelledAt} />}
            </div>
          </div>

          {/* Delivery address */}
          {hasDelivAddr && (
            <div className="rounded-lg border border-border bg-white px-5 py-4">
              <SectionLabel>Delivery Address</SectionLabel>
              <p className="text-sm text-text leading-relaxed">
                {[delivAddr!.line1, delivAddr!.line2, delivAddr!.city, delivAddr!.state, delivAddr!.postcode, delivAddr!.country]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </div>
          )}

          {/* Billing address */}
          {hasBillAddr && (
            <div className="rounded-lg border border-border bg-white px-5 py-4">
              <SectionLabel>Billing Address</SectionLabel>
              <p className="text-sm text-text leading-relaxed">
                {[billAddr!.line1, billAddr!.line2, billAddr!.city, billAddr!.state, billAddr!.postcode, billAddr!.country]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </div>
          )}

        </div>
      </div>
    </AdminLayout>
  );
}

function TimelineRow({ label, date }: { label: string; date: string | null }) {
  if (!date) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
      <div>
        <p className="text-xs font-medium text-text">{label}</p>
        <p className="text-xs text-muted">{new Date(date).toLocaleString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })}</p>
      </div>
    </div>
  );
}
