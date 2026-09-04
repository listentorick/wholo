'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Drawer } from '@/components/Drawer';
import { useAuth } from '@/lib/auth-context';
import { adminOrdersApi, ApiError } from '@wholo/admin-api-client';
import type { DeliveryOutcomeDetail } from '@wholo/types';
import { ProofStatusCard } from './ProofStatusCard';
import { ProofDetailList } from './ProofDetailList';
import { DeliveryProofPhotos } from './DeliveryProofPhotos';
import { DeliverySignature } from './DeliverySignature';

// Map pulls in maplibre-gl (~large) and touches window — load it only when a
// location was actually captured.
const DeliveryLocationMap = dynamic(
  () => import('./DeliveryLocationMap').then((m) => m.DeliveryLocationMap),
  { ssr: false },
);

interface ProofOfDeliveryDrawerProps {
  orderId: string;
  orderNumber: string;
  onClose: () => void;
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      {children}
    </section>
  );
}

export function ProofOfDeliveryDrawer({ orderId, orderNumber, onClose }: ProofOfDeliveryDrawerProps) {
  const { accessToken } = useAuth();
  const [data, setData] = useState<DeliveryOutcomeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notRecorded, setNotRecorded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotRecorded(false);
    adminOrdersApi
      .getDeliveryOutcome(orderId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotRecorded(true);
        else setError('Could not load the proof of delivery.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, accessToken]);

  const viewOrderLink = (
    <Link href={`/orders/${orderId}`} className="text-sm font-medium text-primary hover:underline">
      View order
    </Link>
  );

  return (
    <Drawer onClose={onClose} width={520}>
      <div className="flex items-start justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-text">Proof of delivery</h2>
          <p className="mt-0.5 text-xs text-muted">{orderNumber}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-text transition-colors"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="px-6 py-5">
        <div className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
            </div>
          ) : error ? (
            <>
              <p className="text-sm text-red-600">{error}</p>
              {viewOrderLink}
            </>
          ) : notRecorded ? (
            <>
              <p className="text-sm text-muted">No proof of delivery has been recorded for this order.</p>
              {viewOrderLink}
            </>
          ) : data ? (
            <>
              <ProofStatusCard outcome={data.outcome} recordedAt={data.serverRecordedAt} />

              <ProofDetailList outcome={data} />

              <Section title="Delivery photo">
                <DeliveryProofPhotos photos={data.photos} />
              </Section>

              <Section title="Signature">
                <DeliverySignature signature={data.signature} />
              </Section>

              <Section title="Location">
                {data.location.available && data.location.latitude != null && data.location.longitude != null ? (
                  <div className="space-y-2">
                    <DeliveryLocationMap
                      latitude={data.location.latitude}
                      longitude={data.location.longitude}
                      accuracyM={data.location.accuracyM}
                    />
                    <p className="text-xs text-muted">
                      {data.location.latitude.toFixed(5)}, {data.location.longitude.toFixed(5)}
                      {data.location.accuracyM != null && ` · accurate to ~${Math.round(data.location.accuracyM)} m`}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">Location unavailable</p>
                )}
              </Section>

              {viewOrderLink}
            </>
          ) : null}
        </div>
      </div>
    </Drawer>
  );
}
