'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { DeliveryOrderSummary } from '@/components/delivery/DeliveryOrderSummary';
import { OutcomeSelector } from '@/components/delivery/OutcomeSelector';
import { DeliveryMethodSelector } from '@/components/delivery/DeliveryMethodSelector';
import { ProofOfDeliveryForm } from '@/components/delivery/ProofOfDeliveryForm';
import { PhotoItem } from '@/components/delivery/DeliveryPhotos';
import { ConfirmDeliverySignature } from '@/components/delivery/ConfirmDeliverySignature';
import { UnableToDeliverForm } from '@/components/delivery/UnableToDeliverForm';
import { ReviewStep } from '@/components/delivery/ReviewStep';
import { DeliveryConfirmation } from '@/components/delivery/DeliveryConfirmation';
import {
  DeliveryLinkError,
  deleteDeliveryPhoto,
  getDeliveryOrder,
  submitDeliveryOutcome,
  uploadDeliveryPhoto,
} from '@/lib/delivery-api';
import { compressImage } from '@/lib/image';
import { captureDeviceLocation } from '@/lib/geolocation';
import {
  DeviceLocation,
  DeliveryLinkOrder,
  DeliveryOutcomeType,
  SignatureStrokeData,
  SubmitOutcomeRequest,
} from '@/types/delivery';

// No [token] dynamic segment — the token lives in the URL fragment
// (window.location.hash), which the browser never sends to any server. See
// the plan's "Keeping the token out of logs" note (PRD §7). Every API call
// from here on carries the token as an X-Delivery-Token header instead.
type Step =
  | 'outcome-select'
  | 'delivery-method'
  | 'proof-of-delivery'
  | 'confirm-delivery'
  | 'unable-form'
  | 'review';

// The page's working copy of a photo — the DeliveryPhotos component only reads
// the PhotoItem fields; `blob` is kept here for retry.
type WorkingPhoto = PhotoItem & { blob: Blob };

let photoSeq = 0;

export default function DeliveryPage() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'unavailable' | 'ready'>('loading');
  const [order, setOrder] = useState<DeliveryLinkOrder | null>(null);
  const [step, setStep] = useState<Step>('outcome-select');
  const [recipientName, setRecipientName] = useState('');
  const [photos, setPhotos] = useState<WorkingPhoto[]>([]);
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const locationRequested = useRef(false);
  const [pendingOutcome, setPendingOutcome] = useState<SubmitOutcomeRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const hashToken = window.location.hash.slice(1);
    if (!hashToken) {
      setStatus('unavailable');
      return;
    }
    setToken(hashToken);
    getDeliveryOrder(hashToken)
      .then((fetched) => {
        setOrder(fetched);
        setStatus('ready');
      })
      .catch(() => setStatus('unavailable'));
  }, []);

  function selectOutcome(outcome: DeliveryOutcomeType) {
    setStep(outcome === 'DELIVERED' ? 'delivery-method' : 'unable-form');
  }

  const captureLocationOnce = useCallback(() => {
    if (locationRequested.current) return;
    locationRequested.current = true;
    void captureDeviceLocation().then(setLocation);
  }, []);

  const uploadPhoto = useCallback(
    async (clientId: string, blob: Blob) => {
      if (!token) return;
      setPhotos((prev) => prev.map((p) => (p.clientId === clientId ? { ...p, status: 'uploading' } : p)));
      try {
        const { id } = await uploadDeliveryPhoto(token, blob);
        setPhotos((prev) => prev.map((p) => (p.clientId === clientId ? { ...p, status: 'done', photoId: id } : p)));
      } catch {
        setPhotos((prev) => prev.map((p) => (p.clientId === clientId ? { ...p, status: 'error' } : p)));
      }
    },
    [token],
  );

  const addPhoto = useCallback(
    async (file: File) => {
      const clientId = `p${photoSeq++}`;
      const blob = await compressImage(file);
      const previewUrl = URL.createObjectURL(blob);
      setPhotos((prev) => [...prev, { clientId, previewUrl, status: 'uploading', blob }]);
      void uploadPhoto(clientId, blob);
    },
    [uploadPhoto],
  );

  const removePhoto = useCallback(
    (clientId: string) => {
      setPhotos((prev) => {
        const photo = prev.find((p) => p.clientId === clientId);
        if (photo) {
          URL.revokeObjectURL(photo.previewUrl);
          if (photo.photoId && token) void deleteDeliveryPhoto(token, photo.photoId).catch(() => {});
        }
        return prev.filter((p) => p.clientId !== clientId);
      });
    },
    [token],
  );

  const retryPhoto = useCallback(
    (clientId: string) => {
      const photo = photos.find((p) => p.clientId === clientId);
      if (photo) void uploadPhoto(clientId, photo.blob);
    },
    [photos, uploadPhoto],
  );

  async function submit(outcome: SubmitOutcomeRequest) {
    if (!token) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const updated = await submitDeliveryOutcome(token, outcome);
      setOrder(updated);
    } catch (err) {
      setSubmitError(err instanceof DeliveryLinkError ? err.message : 'Something went wrong — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function acceptDelivery(signature: SignatureStrokeData, capturedAt: string) {
    const photoIds = photos.filter((p) => p.status === 'done' && p.photoId).map((p) => p.photoId!);
    void submit({
      outcome: 'DELIVERED',
      dropMethod: 'HANDED_TO_PERSON',
      recipientName,
      signature,
      capturedAt,
      ...(photoIds.length > 0 && { photoIds }),
      ...(location && { location }),
    });
  }

  if (status === 'loading') {
    return (
      <PageShell center>
        <PageSpinner />
      </PageShell>
    );
  }

  if (status === 'unavailable') {
    return (
      <PageShell center>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-foreground">This delivery link isn&apos;t available</h1>
          <p className="mt-2 text-sm text-foreground-secondary">
            It may have expired, or the order it relates to is no longer available for delivery.
          </p>
        </div>
      </PageShell>
    );
  }

  if (!order) return null;

  if (order.state === 'SUBMITTED') {
    return (
      <PageShell center>
        <DeliveryConfirmation order={order} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      {step === 'outcome-select' && (
        <div className="flex flex-col gap-6">
          <DeliveryOrderSummary order={order} />
          <OutcomeSelector onSelect={selectOutcome} />
        </div>
      )}

      {step === 'delivery-method' && (
        <DeliveryMethodSelector
          onBack={() => setStep('outcome-select')}
          onContinue={() => setStep('proof-of-delivery')}
        />
      )}

      {step === 'proof-of-delivery' && (
        <ProofOfDeliveryForm
          photos={photos}
          onAddPhoto={addPhoto}
          onRemovePhoto={removePhoto}
          onRetryPhoto={retryPhoto}
          onEnter={captureLocationOnce}
          onBack={() => setStep('delivery-method')}
          onContinue={(name) => {
            setRecipientName(name);
            setStep('confirm-delivery');
          }}
        />
      )}

      {step === 'confirm-delivery' && (
        <ConfirmDeliverySignature
          order={order}
          recipientName={recipientName}
          onAccept={acceptDelivery}
          submitting={submitting}
          error={submitError}
        />
      )}

      {step === 'unable-form' && (
        <UnableToDeliverForm
          onBack={() => setStep('outcome-select')}
          onContinue={({ unableReason, unableReasonNote }) => {
            setPendingOutcome({
              outcome: 'UNABLE_TO_DELIVER',
              unableReason,
              ...(unableReasonNote && { unableReasonNote }),
            });
            setStep('review');
          }}
        />
      )}

      {step === 'review' && pendingOutcome && (
        <ReviewStep
          outcome={pendingOutcome}
          onBack={() => setStep('unable-form')}
          onConfirm={() => submit(pendingOutcome)}
          submitting={submitting}
          error={submitError}
        />
      )}
    </PageShell>
  );
}
