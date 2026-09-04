'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { OrderStatus, type OrderSummary } from '@wholo/types';
import { adminOrdersApi, adminDeliveryRunsApi, ApiError } from '@wholo/admin-api-client';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ChangeDeliveryDateDialog } from './ChangeDeliveryDateDialog';

const LIMIT = 10;

// Closes the "undated accepted orders are invisible on every dated board"
// gap M3 flagged (docs/delivery-planning-pbi-plan.md §3.6 Risks) — M3 only
// gave it visibility; M5 adds the "Set delivery date" action, reusing the
// same ChangeDeliveryDateDialog the board uses (its CAS already handles
// expectedScheduledDeliveryDate: null for an order that's never had one).
// Self-contained, same load-on-mount shape as WorkloadStrip, since
// apps/admin/orders isn't URL-param/filter-driven — a link into a filtered
// Orders list wouldn't actually filter anything. Its own mutation flow is
// independent of the board's page.tsx (different data source entirely).
export function UndatedDeliveriesPanel() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [dialogOrder, setDialogOrder] = useState<OrderSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const load = useCallback(async () => {    try {
      const result = await adminOrdersApi.listOrders({ status: OrderStatus.ACCEPTED, undated: true, limit: LIMIT });
      setOrders(result.data);
      setTotal(result.pagination.total);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConfirm(params: { scheduledDeliveryDate: string; expectedScheduledDeliveryDate: string | null }) {
    if (!dialogOrder) return;
    setSubmitting(true);
    setMutationError(null);
    try {
      await adminDeliveryRunsApi.changeScheduledDeliveryDate(dialogOrder.id, params);
      setDialogOrder(null);
      await load();
    } catch (e) {
      setMutationError(e instanceof ApiError ? (e.problem.detail ?? 'Could not set the delivery date.') : 'Could not set the delivery date.');
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <div className="mb-4">
        <ListErrorBanner message="Could not check for undated deliveries." />
      </div>
    );
  }

  if (orders.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <h2 className="text-sm font-semibold text-text">
        {total} accepted {total === 1 ? 'delivery has' : 'deliveries have'} no delivery date
        {total > orders.length && ` (showing ${orders.length})`}
      </h2>
      <p className="mt-1 text-xs text-muted">
        These never appear on a dated board until they get a delivery date.
      </p>
      {mutationError && <p className="mt-1 text-xs text-red-700">{mutationError}</p>}
      <ul className="mt-2 divide-y divide-amber-200">
        {orders.map((order) => (
          <li key={order.id} className="flex items-center justify-between py-1.5 text-sm">
            <Link href={`/orders/${order.id}`} className="font-medium text-primary hover:underline">
              {order.orderNumber}
            </Link>
            <span className="text-muted">{order.traderCustomerName}</span>
            <button
              type="button"
              onClick={() => setDialogOrder(order)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Set delivery date
            </button>
          </li>
        ))}
      </ul>
      {dialogOrder && (
        <ChangeDeliveryDateDialog
         
          orderId={dialogOrder.id}
          orderNumber={dialogOrder.orderNumber}
          customerName={dialogOrder.traderCustomerName}
          currentScheduledDeliveryDate={null}
          requestedDeliveryDate={dialogOrder.requestedDeliveryDate}
          submitting={submitting}
          onCancel={() => setDialogOrder(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
