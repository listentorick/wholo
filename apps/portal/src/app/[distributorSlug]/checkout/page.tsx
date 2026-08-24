'use client';

import { useState, useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { useDistributor } from '@/lib/distributor-context';
import { PageSubHeader } from '@/components/PageSubHeader';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { MinimumOrderProgress } from '@/components/MinimumOrderProgress';
import { ClearCartConfirmationModal } from '@/components/ClearCartConfirmationModal';
import { QuantityStepper } from '@/components/QuantityStepper';
import { ordersApi, deliveryApi, portalApi, ApiError } from '@wholo/api-client';
import { formatMoney } from '@wholo/types';
import type { AddressSnapshot, AvailableDeliveryDate } from '@wholo/types';
import { formatAddress } from '@/lib/format-address';

export default function CheckoutPage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();
  const router = useRouter();

  const { user, accessToken, isLoading: authLoading } = useRequireAuth(pathname ?? `/${distributorSlug}/checkout`);
  const { orderAsMode, orderAsCustomerId, clearOrderAsSession } = useAuth();
  const { cartLoading, items, quantities, subtotal, taxAmount, taxLabel, total, savingItems, syncItem, refreshCart } = useCart();
  const { effectiveMinSpend, distributor } = useDistributor();

  const [poOpen, setPoOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [poNumber, setPoNumber] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [clearCartConfirmOpen, setClearCartConfirmOpen] = useState(false);

  const [availableDates, setAvailableDates] = useState<AvailableDeliveryDate[]>([]);
  const [loadingDates, setLoadingDates] = useState(true);
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<string | null>(null);

  const [deliveryAddress, setDeliveryAddress] = useState<AddressSnapshot | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(true);

  // The customer whose record we read: the impersonated customer in order-as mode,
  // otherwise the logged-in organisation.
  const customerId = orderAsCustomerId ?? user?.organisationId ?? null;

  useEffect(() => {
    if (!accessToken) return;
    setLoadingDates(true);
    deliveryApi
      .getAvailableDates(distributorSlug, accessToken)
      .then((res) => setAvailableDates(res.dates))
      .catch(() => setAvailableDates([]))
      .finally(() => setLoadingDates(false));
  }, [accessToken, distributorSlug]);

  useEffect(() => {
    if (!accessToken || !customerId) return;
    setLoadingAddress(true);
    portalApi
      .getMyDeliveryAddress(distributorSlug, customerId, accessToken)
      .then((res) => setDeliveryAddress(res.deliveryAddress))
      .catch(() => setDeliveryAddress(null))
      .finally(() => setLoadingAddress(false));
  }, [accessToken, customerId, distributorSlug]);

  const handlePlaceOrder = async () => {
    if (!accessToken || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await ordersApi.submitOrder(
        {
          distributorSlug,
          customerReference: poNumber || undefined,
          notes: comment || undefined,
          requestedDeliveryDate: selectedDeliveryDate ?? undefined,
        },
        accessToken,
      );
      if (orderAsMode) {
        // Session was consumed atomically with order creation — clear it from storage
        // before any further requests fire (those would 401 with the stale token).
        // Admin belongs back in the admin portal now.
        clearOrderAsSession();
      } else {
        await refreshCart(); // re-sync from server (server cleared the cart on submission)
        router.push(`/${distributorSlug}/orders/${order.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.problem.status === 422) {
        // Delivery date no longer valid — re-fetch available dates and prompt reselection
        setSelectedDeliveryDate(null);
        deliveryApi
          .getAvailableDates(distributorSlug, accessToken)
          .then((res) => setAvailableDates(res.dates))
          .catch(() => {});
        setSubmitError('That delivery date is no longer available. Please select another date.');
      } else {
        setSubmitError(err instanceof ApiError ? err.problem.detail : 'Failed to place order. Please try again.');
      }
      setSubmitting(false);
    }
  };

  const handleRemove = (productId: string) => {
    syncItem(productId, 0);
  };

  const handleClearCart = async () => {
    await Promise.all(items.map((item) => syncItem(item.productId, 0)));
    setClearCartConfirmOpen(false);
  };

  const freight = 0;
  const fmt = (n: number) => formatMoney(n, distributor?.currencyCode ?? 'GBP');
  const belowMinimum = effectiveMinSpend != null && subtotal < effectiveMinSpend;

  if (authLoading || cartLoading) {
    return (
      <PageShell center>
        <PageSpinner />
      </PageShell>
    );
  }

  if (!user) return null;

  if (items.length === 0) {
    return (
      <>
        <PageSubHeader backLabel="Products" backHref={`/${distributorSlug}/products`} title="Checkout" />
        <style>{`
          @keyframes co-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
          .co-empty { animation: co-fade-up 0.4s ease both 0.1s; }
        `}</style>
        <PageShell center className="co-empty px-8 text-center gap-6">
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            border: '1.5px solid hsl(var(--color-border))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'hsl(var(--color-border))',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} style={{ width: 26, height: 26 }}>
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
          </div>
          <div className="flex flex-col gap-1.5">
            <p style={{ fontSize: 15, color: 'hsl(var(--color-text))', fontWeight: 400 }}>Your cart is empty</p>
            <p style={{ fontSize: 13, color: 'hsl(var(--color-muted))' }}>Add products to get started</p>
          </div>
          <button
            onClick={() => router.push(`/${distributorSlug}/products`)}
            style={{
              border: '1.5px solid hsl(var(--color-primary))',
              background: 'transparent',
              color: 'hsl(var(--color-primary))',
              padding: '11px 28px',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Browse Products
          </button>
        </PageShell>
      </>
    );
  }

  return (
    <>
      <style>{`
        @keyframes co-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .co-section { animation: co-fade-up 0.35s ease both; }

        .co-trash-btn {
          width: 30px; height: 30px; border-radius: 0;
          border: none; background: transparent; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: hsl(var(--color-border)); transition: color 0.15s;
          flex-shrink: 0; padding: 0; font-family: inherit;
        }
        .co-trash-btn:hover { color: #DC2626; }
        .co-trash-btn:disabled { cursor: not-allowed; opacity: 0.35; }
        .co-trash-btn:focus-visible {
          outline: none; box-shadow: 0 0 0 2px hsl(var(--color-primary));
        }

        .co-expand-btn {
          display: flex; align-items: center; gap: 6px;
          background: none; border: none; cursor: pointer;
          padding: 0; font-family: inherit;
          color: hsl(var(--color-primary)); font-size: 11px; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
        }

        .co-expand-content {
          display: grid;
          grid-template-rows: 0fr;
          overflow: hidden;
          opacity: 0;
          transition: grid-template-rows 0.25s ease, opacity 0.2s ease;
        }
        .co-expand-content > div { min-height: 0; overflow: hidden; }
        .co-expand-content.open   { grid-template-rows: 1fr; opacity: 1; }
        .co-expand-content.closed { grid-template-rows: 0fr; opacity: 0; }

        .co-field {
          width: 100%; border: none;
          border-bottom: 1.5px solid hsl(var(--color-border));
          background: transparent; padding: 8px 0 10px;
          font-size: 14px; color: hsl(var(--color-text)); outline: none;
          font-family: inherit; caret-color: hsl(var(--color-primary));
        }
        .co-field::placeholder { color: hsl(var(--color-muted) / 0.55); }
        .co-field:focus {
          border-bottom-color: hsl(var(--color-primary));
          box-shadow: 0 2px 0 0 hsl(var(--color-primary));
        }
        .co-field:focus-visible { outline: 2px solid hsl(var(--color-primary)); outline-offset: 2px; }

        .co-place-order {
          width: 100%; border: none; background: hsl(var(--color-primary));
          color: hsl(var(--color-primary-fg)); padding: 15px 20px; font-size: 14px; font-weight: 600;
          letter-spacing: 0.08em; cursor: pointer;
          font-family: inherit; text-align: center;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.15s;
        }
        .co-place-order:hover:not(:disabled) { background: hsl(var(--color-primary-hover)); }
        .co-place-order:disabled { opacity: 0.4; cursor: not-allowed; }

        .co-ghost-btn {
          width: 100%; border: none; background: transparent;
          color: hsl(var(--color-muted)); padding: 12px 20px; font-size: 14px; font-weight: 400;
          cursor: pointer; font-family: inherit; transition: color 0.15s;
        }
        .co-ghost-btn:hover    { color: hsl(var(--color-text)); }
        .co-ghost-btn:disabled { cursor: not-allowed; opacity: 0.45; }
      `}</style>

      <PageSubHeader backLabel="Products" backHref={`/${distributorSlug}/products`} title="Checkout" />

      <PageShell padding="none" className="pb-10">

        {/* Product list */}
        <div className="co-section" style={{ animationDelay: '0.05s' }}>
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'hsl(var(--color-muted))',
            padding: '10px 16px 4px',
          }}>
            Products
          </p>

          {items.map((item, i) => {
            const qty = quantities[item.productId] ?? item.quantity;
            const lineTotal = qty * parseFloat(item.unitPrice);
            const saving = savingItems.has(item.productId);
            const delay = Math.min(0.08 + i * 0.05, 0.45);

            return (
              <div
                key={item.productId}
                className="co-section border-b border-border px-4 pt-3 pb-3"
                style={{ animationDelay: `${delay}s`, opacity: saving ? 0.5 : 1, transition: 'opacity 0.2s' }}
              >
                {/* Row 1: product name + stepper + trash */}
                <div className="flex items-center justify-between gap-3">
                  <span style={{
                    fontSize: 14, fontWeight: 500, color: 'hsl(var(--color-text))',
                    flex: 1, minWidth: 0, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.product.name}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <QuantityStepper
                      value={qty}
                      min={1}
                      saving={saving}
                      itemLabel={item.product.name}
                      onChange={(next) => syncItem(item.productId, next)}
                    />
                    <button
                      className="co-trash-btn"
                      aria-label="Remove item"
                      disabled={saving}
                      onClick={() => handleRemove(item.productId)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 15, height: 15 }}>
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Row 2: unit price + line total */}
                <div className="flex items-center justify-between mt-1.5">
                  <span style={{ fontSize: 12, color: 'hsl(var(--color-muted))' }}>
                    {fmt(parseFloat(item.unitPrice))} ea
                  </span>
                  <span style={{ fontSize: 12, color: 'hsl(var(--color-muted))' }}>
                    Total&nbsp;&nbsp;{fmt(lineTotal)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order summary */}
        <div className="co-section px-4 py-4 border-b border-border" style={{ animationDelay: '0.2s' }}>
          {[
            { label: 'Subtotal', value: fmt(subtotal) },
            { label: 'Freight',  value: fmt(freight)  },
            { label: taxLabel,  value: fmt(taxAmount) },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-1.5">
              <span style={{ fontSize: 14, color: 'hsl(var(--color-text))' }}>{row.label}</span>
              <span style={{ fontSize: 14, color: 'hsl(var(--color-text))' }}>{row.value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
            <span style={{ fontSize: 15, color: 'hsl(var(--color-text))', fontWeight: 500 }}>Total</span>
            <span style={{ fontSize: 15, color: 'hsl(var(--color-text))', fontWeight: 500 }}>{fmt(total)}</span>
          </div>
          <MinimumOrderProgress subtotal={subtotal} minimum={effectiveMinSpend} size="prominent" />
        </div>

        {/* PO Number + Comment */}
        <div className="co-section px-4 py-4 border-b border-border flex flex-col gap-4" style={{ animationDelay: '0.25s' }}>
          <div>
            <button className="co-expand-btn" onClick={() => setPoOpen((o) => !o)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 11, height: 11 }}>
                {poOpen
                  ? <line x1="5" y1="12" x2="19" y2="12" />
                  : <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>
                }
              </svg>
              PO Number
            </button>
            <div className={`co-expand-content ${poOpen ? 'open' : 'closed'}`}>
              <div className="pt-3">
                <input
                  className="co-field"
                  placeholder="Enter PO number…"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <button className="co-expand-btn" onClick={() => setCommentOpen((o) => !o)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 11, height: 11 }}>
                {commentOpen
                  ? <line x1="5" y1="12" x2="19" y2="12" />
                  : <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>
                }
              </svg>
              Comment
            </button>
            <div className={`co-expand-content ${commentOpen ? 'open' : 'closed'}`}>
              <div className="pt-3">
                <input
                  className="co-field"
                  placeholder="Add a comment…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Delivery Address */}
        {!loadingAddress && (
          <div className="co-section px-4 py-5 border-b border-border" style={{ animationDelay: '0.3s' }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(var(--color-muted))', textAlign: 'center', marginBottom: 12 }}>
              Delivery Address
            </p>
            {formatAddress(deliveryAddress) ? (
              <p style={{ fontSize: 13, color: 'hsl(var(--color-text))', lineHeight: 1.7, textAlign: 'center' }}>
                {formatAddress(deliveryAddress)}
              </p>
            ) : (
              <p style={{ fontSize: 12, color: 'hsl(var(--color-muted))', textAlign: 'center' }}>
                No delivery address on file. Please contact your distributor to add one.
              </p>
            )}
          </div>
        )}

        {/* Delivery Day */}
        <div className="co-section px-4 py-5 border-b border-border" style={{ animationDelay: '0.35s' }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(var(--color-muted))', textAlign: 'center', marginBottom: 12 }}>
            Delivery Day
          </p>
          {loadingDates ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
            </div>
          ) : availableDates.length === 0 ? (
            <p style={{ fontSize: 12, color: 'hsl(var(--color-muted))', textAlign: 'center' }}>
              No delivery dates available right now. Please contact your distributor.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {availableDates.map((d) => {
                const isSelected = selectedDeliveryDate === d.date;
                const deliveryDate = new Date(d.date + 'T00:00:00');
                const cutoff = new Date(d.cutoffDeadline);
                const cutoffLabel = cutoff.toLocaleString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long',
                  hour: 'numeric', minute: '2-digit', hour12: true,
                });
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setSelectedDeliveryDate(isSelected ? null : d.date)}
                    style={{
                      border: `1.5px solid ${isSelected ? 'hsl(var(--color-primary))' : 'hsl(var(--color-border))'}`,
                      background: isSelected ? 'hsl(var(--color-primary-subtle))' : 'transparent',
                      padding: '12px 14px',
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                      gap: 3, cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'border-color 0.15s, background 0.15s',
                      textAlign: 'left', width: '100%',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 500, color: isSelected ? 'hsl(var(--color-primary))' : 'hsl(var(--color-text))' }}>
                      {deliveryDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </span>
                    <span style={{ fontSize: 12, color: 'hsl(var(--color-muted))' }}>
                      Order by {cutoffLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="co-section px-4 pt-5 pb-2 flex flex-col gap-1" style={{ animationDelay: '0.4s' }}>
          <button
            className="co-place-order"
            disabled={submitting || belowMinimum}
            onClick={handlePlaceOrder}
          >
            {submitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : null}
            {submitting ? 'Placing Order…' : 'Place Order'}
          </button>
          {belowMinimum && !submitError && (
            <p style={{ fontSize: 12, color: '#DC2626', textAlign: 'center', padding: '6px 0 2px' }}>
              Minimum order value not yet met
            </p>
          )}
          {submitError && (
            <p style={{ fontSize: 12, color: '#DC2626', textAlign: 'center', padding: '6px 0 2px' }}>
              {submitError}
            </p>
          )}
          <button className="co-ghost-btn" disabled>
            Add to Favorites
          </button>
          <button className="co-ghost-btn" disabled={submitting} onClick={() => setClearCartConfirmOpen(true)}>
            Clear Cart
          </button>
        </div>

      </PageShell>

      {clearCartConfirmOpen && (
        <ClearCartConfirmationModal
          itemCount={items.length}
          onConfirm={handleClearCart}
          onClose={() => setClearCartConfirmOpen(false)}
        />
      )}
    </>
  );
}
