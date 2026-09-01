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
import { Eyebrow } from '@/components/Eyebrow';
import { ordersApi, deliveryApi, portalApi, ApiError } from '@wholo/api-client';
import { formatMoney } from '@wholo/types';
import type { AddressSnapshot, AvailableDeliveryDate } from '@wholo/types';
import { formatAddress } from '@/lib/format-address';

/** White 8px card on the Pale Stone checkout canvas. */
const CARD = 'co-card rounded-lg border border-border bg-surface p-5 shadow-sm';

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-[15px] w-[15px]">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  );
}

export default function CheckoutPage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();
  const router = useRouter();

  const { user, accessToken, isLoading: authLoading } = useRequireAuth(pathname ?? `/${distributorSlug}/checkout`);
  const { orderAsMode, orderAsCustomerId, clearOrderAsSession } = useAuth();
  const { cartLoading, items, quantities, subtotal, taxAmount, taxLabel, total, savingItems, syncItem, refreshCart } = useCart();
  const { effectiveMinSpend, distributor } = useDistributor();

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
        <PageShell center className="co-empty gap-6 px-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-border text-border">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} className="h-[26px] w-[26px]">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-foreground">Your cart is empty</p>
            <p className="text-xs text-muted">Add products to get started</p>
          </div>
          <button
            onClick={() => router.push(`/${distributorSlug}/products`)}
            className="rounded-md border-[1.5px] border-primary px-7 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary transition-colors hover:bg-accent-subtle"
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
        @keyframes co-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .co-card { animation: co-fade 0.3s ease both; }
      `}</style>

      <PageSubHeader backLabel="Products" backHref={`/${distributorSlug}/products`} title="Checkout" />

      <PageShell width="full" padding="none">
        <div className="flex-1 bg-canvas px-4 py-4 md:px-8 md:py-8">
          <div className="mx-auto grid w-full max-w-[1200px] gap-4 md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-6">

            {/* ─────────────── Left: the order ─────────────── */}
            <div className="flex min-w-0 flex-col gap-4 md:gap-5">

              {/* Products */}
              <div className={CARD} style={{ animationDelay: '0.02s' }}>
                <Eyebrow className="mb-3">Products</Eyebrow>
                {items.map((item) => {
                  const qty = quantities[item.productId] ?? item.quantity;
                  const lineTotal = qty * parseFloat(item.unitPrice);
                  const saving = savingItems.has(item.productId);
                  return (
                    <div
                      key={item.productId}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border py-3.5 first:pt-1 last:border-b-0 last:pb-0"
                      style={{ opacity: saving ? 0.5 : 1, transition: 'opacity 0.2s' }}
                    >
                      <span className="w-full truncate text-sm font-medium text-foreground md:w-auto md:flex-1">
                        {item.product.name}
                      </span>
                      <span className="whitespace-nowrap text-xs text-muted">{fmt(parseFloat(item.unitPrice))} ea</span>
                      <QuantityStepper
                        value={qty}
                        min={1}
                        saving={saving}
                        itemLabel={item.product.name}
                        onChange={(next) => syncItem(item.productId, next)}
                        className="ml-auto md:ml-0"
                      />
                      <span className="w-16 whitespace-nowrap text-right text-sm font-semibold text-foreground">
                        {fmt(lineTotal)}
                      </span>
                      <button
                        type="button"
                        aria-label="Remove item"
                        disabled={saving}
                        onClick={() => handleRemove(item.productId)}
                        className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-border transition-colors hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Purchase order & notes */}
              <div className={CARD} style={{ animationDelay: '0.06s' }}>
                <Eyebrow className="mb-3">Purchase order &amp; notes</Eyebrow>
                <div className="flex flex-col gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">PO number</span>
                    <input
                      value={poNumber}
                      onChange={(e) => setPoNumber(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">Comment</span>
                    <input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a note for this order…"
                      className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                </div>
              </div>

              {/* Delivery address */}
              {!loadingAddress && (
                <div className={CARD} style={{ animationDelay: '0.1s' }}>
                  <Eyebrow className="mb-3">Delivery address</Eyebrow>
                  {formatAddress(deliveryAddress) ? (
                    <p className="text-sm leading-relaxed text-foreground">{formatAddress(deliveryAddress)}</p>
                  ) : (
                    <p className="text-sm text-muted">
                      No delivery address on file. Please contact your distributor to add one.
                    </p>
                  )}
                  {distributor?.name && (
                    <p className="mt-2.5 text-xs text-muted">Held by {distributor.name} — contact them to change it.</p>
                  )}
                </div>
              )}

              {/* Delivery day */}
              <div className={CARD} style={{ animationDelay: '0.12s' }}>
                <Eyebrow className="mb-3">Delivery day</Eyebrow>
                {loadingDates ? (
                  <div className="flex justify-center py-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
                  </div>
                ) : availableDates.length === 0 ? (
                  <p className="text-xs text-muted">
                    No delivery dates available right now. Please contact your distributor.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
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
                          className={[
                            'flex w-full flex-col gap-0.5 rounded-md border-[1.5px] px-3.5 py-3 text-left transition-colors',
                            isSelected ? 'border-primary bg-accent-subtle' : 'border-border hover:border-muted',
                          ].join(' ')}
                        >
                          <span className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                            {deliveryDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </span>
                          <span className="text-xs text-muted">Order by {cutoffLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ─────────────── Right: totals + submit (anchored) ─────────────── */}
            <div className="flex flex-col gap-4 md:sticky md:top-[112px] md:self-start">

              {/* Order summary */}
              <div className={CARD} style={{ animationDelay: '0.16s' }}>
                <Eyebrow className="mb-3">Order summary</Eyebrow>
                {[
                  { label: 'Subtotal', value: fmt(subtotal) },
                  { label: 'Freight', value: fmt(freight) },
                  { label: taxLabel, value: fmt(taxAmount) },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-1.5 text-sm text-foreground">
                    <span>{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                ))}
                <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
                  <span>Total</span>
                  <span>{fmt(total)}</span>
                </div>
                <MinimumOrderProgress subtotal={subtotal} minimum={effectiveMinSpend} size="prominent" />
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2" style={{ animationDelay: '0.22s' }}>
                <button
                  type="button"
                  disabled={submitting || belowMinimum}
                  onClick={handlePlaceOrder}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-3.5 text-sm font-semibold tracking-[0.04em] text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  {submitting ? 'Placing Order…' : 'Place Order'}
                </button>
                {belowMinimum && !submitError && (
                  <p className="text-center text-xs text-error">Minimum order value not yet met</p>
                )}
                {submitError && <p className="text-center text-xs text-error">{submitError}</p>}
                <div className="flex justify-center gap-5 pt-1">
                  <button type="button" disabled className="text-xs text-muted disabled:opacity-50">
                    Add to favourites
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setClearCartConfirmOpen(true)}
                    className="text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    Clear cart
                  </button>
                </div>
              </div>
            </div>
          </div>
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
