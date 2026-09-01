import { OrderStatus } from '@wholo/types';

type Tone = 'green' | 'yellow' | 'red' | 'gray' | 'blue' | 'orange';

const TONE_STYLES: Record<Tone, { bg: string; text: string }> = {
  green:  { bg: '#dcfce7', text: '#15803d' },
  yellow: { bg: '#fef9c3', text: '#a16207' },
  red:    { bg: '#fee2e2', text: '#b91c1c' },
  gray:   { bg: '#f3f4f6', text: '#6b7280' },
  blue:   { bg: '#dbeafe', text: '#1d4ed8' },
  orange: { bg: '#fef3ec', text: '#d97036' },
};

/**
 * Customer-facing order-status pill. Ports the {label, tone} badge from
 * apps/admin (components/list/StatusBadge.tsx + the orders STATUS_META) so the
 * two portals read the same — not shared directly since there's no shared UI
 * package. The labels here are the customer's wording ("Awaiting confirmation"
 * rather than admin's "Pending"); the tones match admin exactly.
 */
const STATUS_META: Record<OrderStatus, { label: string; tone: Tone }> = {
  [OrderStatus.SUBMITTED]:       { label: 'Awaiting confirmation', tone: 'orange' },
  [OrderStatus.ACCEPTED]:        { label: 'Accepted',              tone: 'green'  },
  [OrderStatus.REJECTED]:        { label: 'Rejected',              tone: 'red'    },
  [OrderStatus.CANCELLED]:       { label: 'Cancelled',             tone: 'gray'   },
  [OrderStatus.COMPLETED]:       { label: 'Completed',             tone: 'blue'   },
  [OrderStatus.DELIVERED]:       { label: 'Delivered',             tone: 'green'  },
  [OrderStatus.DELIVERY_FAILED]: { label: 'Delivery failed',       tone: 'red'    },
};

export function OrderStatusBadge({ status }: { status: OrderStatus | string }) {
  const meta = STATUS_META[status as OrderStatus] ?? { label: String(status), tone: 'gray' as const };
  const s = TONE_STYLES[meta.tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.text }} aria-hidden />
      {meta.label}
    </span>
  );
}
