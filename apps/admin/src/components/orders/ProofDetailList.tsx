import type { DeliveryOutcomeDetail } from '@wholo/types';
import { DeliveryDropMethod, DeliveryOutcomeType, UnableToDeliverReason } from '@wholo/types';

const DROP_METHOD_LABELS: Record<DeliveryDropMethod, string> = {
  [DeliveryDropMethod.HANDED_TO_PERSON]: 'Handed to a person',
  [DeliveryDropMethod.LEFT_IN_SAFE_LOCATION]: 'Left in a safe location',
};

const UNABLE_REASON_LABELS: Record<UnableToDeliverReason, string> = {
  [UnableToDeliverReason.CUSTOMER_CLOSED]: 'Customer closed',
  [UnableToDeliverReason.CUSTOMER_REFUSED]: 'Customer refused delivery',
  [UnableToDeliverReason.UNABLE_TO_ACCESS_PREMISES]: 'Unable to access premises',
  [UnableToDeliverReason.INCORRECT_ADDRESS]: 'Incorrect address',
  [UnableToDeliverReason.OTHER]: 'Other',
};

function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm text-text">{children}</dd>
    </div>
  );
}

export function ProofDetailList({ outcome }: { outcome: DeliveryOutcomeDetail }) {
  const failed = outcome.outcome === DeliveryOutcomeType.UNABLE_TO_DELIVER;
  const runDate = fmtDate(outcome.runDeliveryDate);

  return (
    <dl className="divide-y divide-border">
      <Row label="Customer">{outcome.customerName || '—'}</Row>

      {failed ? (
        <>
          <Row label="Reason">
            {outcome.unableReason ? UNABLE_REASON_LABELS[outcome.unableReason] : '—'}
          </Row>
          {outcome.unableReason === UnableToDeliverReason.OTHER && outcome.unableReasonNote && (
            <Row label="Reason note">{outcome.unableReasonNote}</Row>
          )}
        </>
      ) : (
        <>
          <Row label="Delivery method">
            {outcome.dropMethod ? DROP_METHOD_LABELS[outcome.dropMethod] : '—'}
          </Row>
          <Row label="Received by">{outcome.recipientName || '—'}</Row>
        </>
      )}

      <Row label="Driver">{outcome.driverName || '—'}</Row>
      <Row label="Run">
        {outcome.runName ? (
          <>
            {outcome.runName}
            {runDate && <span className="text-muted"> · {runDate}</span>}
          </>
        ) : (
          '—'
        )}
      </Row>

      {outcome.deliveryNotes && <Row label="Delivery notes">{outcome.deliveryNotes}</Row>}

      <Row label="Captured on device">{fmtDateTime(outcome.deviceCapturedAt)}</Row>
      <Row label="Submitted to Stocdup">{fmtDateTime(outcome.serverRecordedAt)}</Row>

      {outcome.submittedViaQrToken ? (
        <Row label="Submission">Via QR link (unauthenticated)</Row>
      ) : (
        <Row label="Submission">By a signed-in driver</Row>
      )}

      {outcome.correctedAt && (
        <Row label="Corrected">
          {fmtDateTime(outcome.correctedAt)}
          {outcome.correctedByName && <span className="text-muted"> · {outcome.correctedByName}</span>}
        </Row>
      )}
    </dl>
  );
}
