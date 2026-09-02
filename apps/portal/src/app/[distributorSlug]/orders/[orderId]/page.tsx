'use client';

import { useState, useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { Truck } from 'lucide-react';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { PageSubHeader } from '@/components/PageSubHeader';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { Eyebrow } from '@/components/Eyebrow';
import { ordersApi, ApiError } from '@wholo/api-client';
import type { AddressSnapshot, Order } from '@wholo/types';
import { formatMoney } from '@wholo/types';
import { formatAddress } from '@/lib/format-address';

/** White 8px card — matches the checkout / product-detail restyle language. */
const CARD = 'od-section rounded-lg border border-border bg-surface p-5 shadow-sm';

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  SUBMITTED: { color: 'hsl(var(--color-accent))', bg: 'hsl(var(--color-accent-light))', border: 'hsl(var(--color-accent-border))', label: 'Awaiting Confirmation' },
  ACCEPTED:  { color: '#16A34A', bg: '#DCFCE7', border: '#BBF7D0', label: 'Confirmed'   },
  REJECTED:  { color: '#DC2626', bg: '#FEE2E2', border: '#FECACA', label: 'Rejected'    },
  CANCELLED: { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB', label: 'Cancelled'   },
  COMPLETED: { color: '#2563EB', bg: '#DBEAFE', border: '#BFDBFE', label: 'Completed'   },
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtAmt(amount: string, currency: string) {
  return formatMoney(amount, currency);
}

/** Uppercase micro-label for the PO Ref / Notes rows in the order header. */
function MetaLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="min-w-[80px] text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-tertiary">
      {children}
    </span>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const orderId = params.orderId as string;
  const pathname = usePathname();

  const { user, accessToken, isLoading: authLoading } = useRequireAuth(pathname ?? `/${distributorSlug}/orders/${orderId}`);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !accessToken) return;
    ordersApi.getOrder(orderId)
      .then(setOrder)
      .catch(() => setError('Order not found or could not be loaded'))
      .finally(() => setLoading(false));
  }, [authLoading, accessToken, orderId]);

  const handleCancelConfirm = async () => {
    if (!accessToken || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await ordersApi.cancelOrder(orderId, { reason: 'Cancelled by customer' });
      setOrder(updated);
      setCancelConfirm(false);
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.problem.detail : 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  };

  if (authLoading || loading) {
    return (
      <PageShell center>
        <PageSpinner />
      </PageShell>
    );
  }

  if (!user) return null;

  if (error || !order) {
    return (
      <>
        <PageSubHeader backLabel="Orders" backHref={`/${distributorSlug}/orders`} title="Order" />
        <PageShell center className="px-6 text-center">
          <p className="text-sm text-foreground-tertiary">{error ?? 'Order not found'}</p>
        </PageShell>
      </>
    );
  }

  const sc = STATUS_CONFIG[order.status] ?? STATUS_CONFIG['CANCELLED'];
  const delivAddrText = formatAddress(order.deliveryAddressSnapshot as AddressSnapshot | null);

  return (
    <>
      <style>{`
        @keyframes od-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .od-section { animation: od-fade-up 0.32s ease both; }

        .od-img-placeholder {
          background: linear-gradient(145deg, hsl(var(--color-canvas)) 0%, hsl(var(--color-border)) 100%);
          flex-shrink: 0;
          position: relative;
        }
        .od-img-placeholder::after {
          content: '';
          position: absolute;
          top: 50%; left: 50%;
          width: 35%; height: 35%;
          transform: translate(-50%, -50%);
          background-color: hsl(var(--color-text) / 0.1);
          -webkit-mask-image: url('/logos/stocdup-logo-only.png');
          mask-image: url('/logos/stocdup-logo-only.png');
          -webkit-mask-size: contain;
          mask-size: contain;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-position: center;
        }
      `}</style>

      <PageSubHeader backLabel="Orders" backHref={`/${distributorSlug}/orders`} title={order.orderNumber} />

      <PageShell width="full">
        <div className="flex w-full flex-col gap-4 md:gap-5">

          {/* Status banner */}
          <div
            className="od-section rounded-lg border px-4 py-3.5"
            style={{ animationDelay: '0.05s', background: sc.bg, borderColor: sc.border }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{ color: sc.color }}
            >
              {sc.label}
            </p>
            <p className="mt-1 text-[13px]" style={{ color: sc.color, opacity: 0.85 }}>
              {order.status === 'SUBMITTED' && 'Awaiting confirmation from the distributor'}
              {order.status === 'ACCEPTED' && `Confirmed on ${fmtDate(order.acceptedAt)}`}
              {order.status === 'REJECTED' && (
                <>Rejected on {fmtDate(order.rejectedAt)}{order.rejectionReason ? ` — ${order.rejectionReason}` : ''}</>
              )}
              {order.status === 'CANCELLED' && (
                <>Cancelled on {fmtDate(order.cancelledAt)}{order.cancellationReason ? ` — ${order.cancellationReason}` : ''}</>
              )}
            </p>
          </div>

          {/* Order header */}
          <div className={CARD} style={{ animationDelay: '0.1s' }}>
            <Eyebrow className="mb-3">Order</Eyebrow>
            <p className="text-lg font-semibold tracking-[-0.01em] text-foreground">{order.orderNumber}</p>
            <p className="mt-1 text-xs text-muted">Placed {fmtDate(order.submittedAt ?? order.createdAt)}</p>

            {(order.customerReference || order.notes) && (
              <div className="mt-4 flex flex-col gap-1.5">
                {order.customerReference && (
                  <div className="flex items-baseline gap-2">
                    <MetaLabel>PO Ref</MetaLabel>
                    <span className="text-[13px] text-foreground">{order.customerReference}</span>
                  </div>
                )}
                {order.notes && (
                  <div className="flex items-baseline gap-2">
                    <MetaLabel>Notes</MetaLabel>
                    <span className="text-[13px] text-foreground">{order.notes}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Order lines */}
          <div className={CARD} style={{ animationDelay: '0.15s' }}>
            <Eyebrow className="mb-3">Products</Eyebrow>
            {order.lines.map((line, i) => (
              <div
                key={line.id}
                className={`flex items-start justify-between gap-3 py-3.5 first:pt-0 ${
                  i < order.lines.length - 1 ? 'border-b border-border' : 'pb-0'
                }`}
              >
                {line.productThumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={line.productThumbnailUrl}
                    alt=""
                    width={56}
                    height={56}
                    loading="lazy"
                    className="h-14 w-14 flex-shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="od-img-placeholder h-14 w-14 rounded" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">{line.productNameSnapshot}</p>
                  {line.skuSnapshot && (
                    <p className="mt-0.5 text-[11px] text-foreground-tertiary">SKU: {line.skuSnapshot}</p>
                  )}
                  <p className="mt-1 text-xs text-foreground-tertiary">
                    {line.quantityOrdered} × {fmtAmt(line.unitPriceSnapshot, order.currency)}
                    {line.unitOfMeasureSnapshot ? ` / ${line.unitOfMeasureSnapshot}` : ''}
                  </p>
                </div>
                <p className="flex-shrink-0 text-sm font-medium text-foreground">
                  {fmtAmt(line.totalAmount, order.currency)}
                </p>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className={CARD} style={{ animationDelay: '0.2s' }}>
            <Eyebrow className="mb-3">Summary</Eyebrow>
            {[
              { label: 'Subtotal', value: fmtAmt(order.subtotalAmount, order.currency) },
              { label: order.taxLabel, value: fmtAmt(order.taxAmount, order.currency) },
            ].map((row) => (
              <div key={row.label} className="flex justify-between py-1 text-[13px] text-muted">
                <span>{row.label}</span>
                <span>{row.value}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-border pt-2.5 text-[15px] font-semibold text-foreground">
              <span>Total</span>
              <span>{fmtAmt(order.totalAmount, order.currency)}</span>
            </div>
          </div>

          {/* Delivery */}
          {(order.requestedDeliveryDate || delivAddrText) && (
            <div className={CARD} style={{ animationDelay: '0.25s' }}>
              <Eyebrow className="mb-3">Delivery</Eyebrow>
              {order.requestedDeliveryDate && (
                <div className={`flex items-center gap-2 ${delivAddrText ? 'mb-2' : ''}`}>
                  <Truck className="h-4 w-4 flex-shrink-0 text-foreground-tertiary" strokeWidth={1.5} />
                  <p className="text-[13px] text-foreground">{fmtDate(order.requestedDeliveryDate)}</p>
                </div>
              )}
              {delivAddrText && (
                <p className="text-[13px] leading-relaxed text-foreground">{delivAddrText}</p>
              )}
            </div>
          )}

          {/* Cancel section */}
          {order.status === 'SUBMITTED' && (
            <div className="od-section" style={{ animationDelay: '0.3s' }}>
              {!cancelConfirm ? (
                <button
                  onClick={() => setCancelConfirm(true)}
                  className="w-full py-2.5 text-[13px] text-foreground-tertiary transition-colors hover:text-error"
                >
                  Cancel Order
                </button>
              ) : (
                <div className="rounded-lg border-[1.5px] border-error/40 bg-error/5 p-4">
                  <p className="text-[13px] font-medium text-error">Cancel this order?</p>
                  <p className="mb-3.5 mt-1 text-xs text-foreground-tertiary">This cannot be undone.</p>
                  {cancelError && <p className="mb-2.5 text-xs text-error">{cancelError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelConfirm}
                      disabled={cancelling}
                      className="flex-1 rounded-md border-[1.5px] border-error bg-error px-0 py-2.5 text-xs font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
                    </button>
                    <button
                      onClick={() => { setCancelConfirm(false); setCancelError(null); }}
                      disabled={cancelling}
                      className="flex-1 rounded-md border-[1.5px] border-border bg-transparent px-0 py-2.5 text-xs font-medium text-muted"
                    >
                      Keep Order
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </PageShell>
    </>
  );
}
