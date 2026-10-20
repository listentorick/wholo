import { OrderStatus } from '@wholo/types';
import { StatusBadge, type StatusTone } from '@/components/list/StatusBadge';

const STATUS_META: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  [OrderStatus.SUBMITTED]: { label: 'Pending', tone: 'orange' },
  [OrderStatus.ACCEPTED]: { label: 'Accepted', tone: 'green' },
  [OrderStatus.REJECTED]: { label: 'Rejected', tone: 'red' },
  [OrderStatus.CANCELLED]: { label: 'Cancelled', tone: 'gray' },
  [OrderStatus.COMPLETED]: { label: 'Completed', tone: 'blue' },
  [OrderStatus.DELIVERED]: { label: 'Delivered', tone: 'green' },
  [OrderStatus.DELIVERY_FAILED]: { label: 'Delivery failed', tone: 'red' },
};

// An order's lifecycle status, as the distributor sees it (SUBMITTED reads "Pending").
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'gray' as const };
  return <StatusBadge label={meta.label} tone={meta.tone} />;
}
