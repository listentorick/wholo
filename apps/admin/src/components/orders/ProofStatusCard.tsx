import { DeliveryOutcomeType } from '@wholo/types';

interface ProofStatusCardProps {
  outcome: DeliveryOutcomeType;
  recordedAt: string;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Green for a clean delivery, amber for an exception (PRD §18 wants
// unable-to-deliver clearly flagged).
export function ProofStatusCard({ outcome, recordedAt }: ProofStatusCardProps) {
  const delivered = outcome === DeliveryOutcomeType.DELIVERED;
  const cls = delivered
    ? 'border-green-200 bg-green-50 text-green-800'
    : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div className={`flex items-start gap-3 rounded-md border px-4 py-3 ${cls}`}>
      <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden>
        {delivered ? (
          <path
            fillRule="evenodd"
            d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z"
            clipRule="evenodd"
          />
        ) : (
          <path
            fillRule="evenodd"
            d="M8.3 3.3c.8-1.3 2.6-1.3 3.4 0l6 10c.8 1.3-.2 3-1.7 3H4c-1.5 0-2.5-1.7-1.7-3l6-10zM10 7a1 1 0 00-1 1v3a1 1 0 002 0V8a1 1 0 00-1-1zm0 8a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        )}
      </svg>
      <div>
        <p className="text-sm font-semibold">{delivered ? 'Delivered' : 'Unable to deliver'}</p>
        <p className="text-xs opacity-80">{fmtDateTime(recordedAt)}</p>
      </div>
    </div>
  );
}
