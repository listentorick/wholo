'use client';

import { useState, useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { PageSubHeader } from '@/components/PageSubHeader';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { ordersApi, ApiError } from '@wholo/api-client';
import type { Order } from '@wholo/types';

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  SUBMITTED: { color: '#D97036', bg: '#FEF3EC', border: '#FDDCBE', label: 'Awaiting Confirmation' },
  ACCEPTED:  { color: '#16A34A', bg: '#DCFCE7', border: '#BBF7D0', label: 'Confirmed'             },
  REJECTED:  { color: '#DC2626', bg: '#FEE2E2', border: '#FECACA', label: 'Rejected'               },
  CANCELLED: { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB', label: 'Cancelled'              },
  COMPLETED: { color: '#2563EB', bg: '#DBEAFE', border: '#BFDBFE', label: 'Completed'              },
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtAmt(amount: string) {
  return `£${parseFloat(amount).toFixed(2)}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: '#9CA3AF',
      padding: '12px 16px 4px',
    }}>
      {children}
    </p>
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
    ordersApi.getOrder(orderId, accessToken)
      .then(setOrder)
      .catch(() => setError('Order not found or could not be loaded'))
      .finally(() => setLoading(false));
  }, [authLoading, accessToken, orderId]);

  const handleCancelConfirm = async () => {
    if (!accessToken || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await ordersApi.cancelOrder(orderId, { reason: 'Cancelled by customer' }, accessToken);
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
          <p style={{ fontSize: 13, color: '#9CA3AF' }}>{error ?? 'Order not found'}</p>
        </PageShell>
      </>
    );
  }

  const sc = STATUS_CONFIG[order.status] ?? STATUS_CONFIG['CANCELLED'];
  const delivAddr = order.deliveryAddressSnapshot as Record<string, string | null> | null;
  const hasDelivAddr = delivAddr && Object.values(delivAddr).some(Boolean);

  return (
    <>
      <style>{`
        @keyframes od-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .od-section { animation: od-fade-up 0.32s ease both; }
      `}</style>

      <PageSubHeader backLabel="Orders" backHref={`/${distributorSlug}/orders`} title={order.orderNumber} />

      <PageShell padding="none" className="pb-12">

        {/* Status banner */}
        <div
          className="od-section mx-4 mt-4 mb-1 rounded"
          style={{
            animationDelay: '0.05s',
            background: sc.bg,
            border: `1px solid ${sc.border}`,
            padding: '14px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: sc.color,
            }}>
              {sc.label}
            </span>
          </div>
          <p style={{ fontSize: 13, color: sc.color, opacity: 0.85 }}>
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
        <div className="od-section border-b border-[#E5E7EB] px-4 py-4" style={{ animationDelay: '0.1s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A', letterSpacing: '-0.01em' }}>
                {order.orderNumber}
              </p>
              <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3 }}>
                Placed {fmtDate(order.submittedAt ?? order.createdAt)}
              </p>
            </div>
          </div>
          {(order.customerReference || order.notes) && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {order.customerReference && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.06em', textTransform: 'uppercase', minWidth: 80 }}>PO Ref</span>
                  <span style={{ fontSize: 13, color: '#1A1A1A' }}>{order.customerReference}</span>
                </div>
              )}
              {order.notes && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.06em', textTransform: 'uppercase', minWidth: 80 }}>Notes</span>
                  <span style={{ fontSize: 13, color: '#1A1A1A' }}>{order.notes}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Order lines */}
        <SectionLabel>Products</SectionLabel>
        <div className="od-section border-b border-[#E5E7EB]" style={{ animationDelay: '0.15s' }}>
          {order.lines.map((line, i) => (
            <div
              key={line.id}
              className="px-4 py-3"
              style={{ borderBottom: i < order.lines.length - 1 ? '1px solid #F3F4F6' : 'none' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A', marginBottom: 2 }}>
                    {line.productNameSnapshot}
                  </p>
                  {line.skuSnapshot && (
                    <p style={{ fontSize: 11, color: '#9CA3AF' }}>SKU: {line.skuSnapshot}</p>
                  )}
                  <p style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>
                    {line.quantityOrdered} × {fmtAmt(line.unitPriceSnapshot)}
                    {line.unitOfMeasureSnapshot ? ` / ${line.unitOfMeasureSnapshot}` : ''}
                  </p>
                </div>
                <p style={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A', flexShrink: 0 }}>
                  {fmtAmt(line.totalAmount)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="od-section px-4 py-4 border-b border-[#E5E7EB]" style={{ animationDelay: '0.2s' }}>
          {[
            { label: 'Subtotal', value: fmtAmt(order.subtotalAmount) },
            { label: 'Tax (GST)',  value: fmtAmt(order.taxAmount) },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#6B7280' }}>{row.label}</span>
              <span style={{ fontSize: 13, color: '#6B7280' }}>{row.value}</span>
            </div>
          ))}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            paddingTop: 10, marginTop: 2, borderTop: '1px solid #E5E7EB',
          }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A' }}>Total</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A' }}>{fmtAmt(order.totalAmount)}</span>
          </div>
        </div>

        {/* Delivery address */}
        {hasDelivAddr && (
          <>
            <SectionLabel>Delivery Address</SectionLabel>
            <div className="od-section px-4 pb-4 border-b border-[#E5E7EB]" style={{ animationDelay: '0.25s' }}>
              <p style={{ fontSize: 13, color: '#1A1A1A', lineHeight: 1.7 }}>
                {[delivAddr.line1, delivAddr.line2, delivAddr.city, delivAddr.state, delivAddr.postcode, delivAddr.country]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </div>
          </>
        )}

        {/* Cancel section */}
        {order.status === 'SUBMITTED' && (
          <div className="od-section px-4 pt-6 pb-2" style={{ animationDelay: '0.3s' }}>
            {!cancelConfirm ? (
              <button
                onClick={() => setCancelConfirm(true)}
                style={{
                  width: '100%', border: 'none', background: 'transparent',
                  color: '#9CA3AF', padding: '10px 0', fontSize: 13, fontWeight: 400,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#DC2626')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#9CA3AF')}
              >
                Cancel Order
              </button>
            ) : (
              <div style={{
                border: '1.5px solid #FECACA', background: '#FFF5F5',
                borderRadius: 4, padding: '16px',
              }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#DC2626', marginBottom: 4 }}>
                  Cancel this order?
                </p>
                <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 14 }}>
                  This cannot be undone.
                </p>
                {cancelError && (
                  <p style={{ fontSize: 12, color: '#DC2626', marginBottom: 10 }}>{cancelError}</p>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleCancelConfirm}
                    disabled={cancelling}
                    style={{
                      flex: 1, border: '1.5px solid #DC2626', background: '#DC2626',
                      color: '#fff', padding: '10px 0', fontSize: 12, fontWeight: 600,
                      cursor: cancelling ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      opacity: cancelling ? 0.6 : 1, borderRadius: 2,
                    }}
                  >
                    {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
                  </button>
                  <button
                    onClick={() => { setCancelConfirm(false); setCancelError(null); }}
                    disabled={cancelling}
                    style={{
                      flex: 1, border: '1.5px solid #E5E7EB', background: 'transparent',
                      color: '#6B7280', padding: '10px 0', fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', fontFamily: 'inherit', borderRadius: 2,
                    }}
                  >
                    Keep Order
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </PageShell>
    </>
  );
}
