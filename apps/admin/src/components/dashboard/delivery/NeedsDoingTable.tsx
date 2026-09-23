'use client';

import Link from 'next/link';
import type { DeliveryOverview, DeliveryOverviewQueueItem, DeliveryOverviewQueueKind } from '@wholo/types';
import { StatusBadge } from '@/components/list/StatusBadge';
import { ListTableShell } from '@/components/list/ListTableShell';
import { ListTh } from '@/components/list/ListTh';
import { MobileCardList } from '@/components/list/MobileCardList';
import { MobileCardField } from '@/components/list/MobileCardField';
import { SegmentedFilter } from '@/components/list/SegmentedFilter';
import type { QueueFilter } from './AttentionTiles';
import { KIND_META, QUEUE_KINDS, describeItem } from './delivery';

interface Props {
  overview: Pick<DeliveryOverview, 'counts' | 'queue' | 'generatedAt' | 'timezone'>;
  filter: QueueFilter;
  onFilter: (filter: QueueFilter) => void;
}

function totalFor(kind: DeliveryOverviewQueueKind, counts: DeliveryOverview['counts']): number {
  return { FAILED: counts.failedLast24h.count, OVERDUE: counts.overdue.count, TO_ACCEPT: counts.toAccept.count, NOT_ON_RUN: counts.notOnRun.count }[kind];
}

const itemKey = (item: DeliveryOverviewQueueItem) => `${item.kind}-${item.orderId}`;

// The one list someone acts on: failed deliveries, overdue orders, orders
// waiting to be accepted, orders due today with no run. Most urgent first. Each
// row opens the order, where the action lives.
export function NeedsDoingTable({ overview, filter, onFilter }: Props) {
  const { counts, queue } = overview;
  const rows = filter === 'ALL' ? queue : queue.filter((item) => item.kind === filter);
  const capNotes = QUEUE_KINDS.filter((kind) => filter === 'ALL' || filter === kind)
    .map((kind) => ({ kind, shown: queue.filter((i) => i.kind === kind).length, total: totalFor(kind, counts) }))
    .filter((n) => n.total > n.shown);

  return (
    <section aria-labelledby="needs-doing-heading">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="needs-doing-heading" className="text-sm font-semibold text-text">Needs doing</h2>
          <p className="mt-0.5 text-xs text-muted">Everything waiting on someone, most urgent first.</p>
        </div>
        <Link href="/orders" className="text-xs font-medium text-primary hover:underline">Open orders &rsaquo;</Link>
      </div>

      <div className="mb-3">
        <SegmentedFilter
          ariaLabel="Filter the list"
          value={filter}
          onChange={(kind) => onFilter(filter === kind ? 'ALL' : kind)}
          options={[
            { value: 'ALL' as const, label: 'All' },
            ...QUEUE_KINDS.map((kind) => ({ value: kind, label: KIND_META[kind].label, count: totalFor(kind, counts) })),
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <ListTableShell>
          <p className="px-5 py-10 text-center text-sm text-muted">
            {filter === 'ALL' ? 'Nothing needs doing right now. New orders, failed deliveries and overdue orders will queue here.' : `Nothing in “${KIND_META[filter].label}”.`}
          </p>
        </ListTableShell>
      ) : (
        <ListTableShell>
          <MobileCardList
            items={rows}
            getId={itemKey}
            getLabel={(item) => item.customerName}
            entityLabelPlural="items"
            renderPrimary={(item) => item.customerName}
            renderSecondary={(item) => item.orderNumber}
            renderStatus={(item) => <StatusBadge label={KIND_META[item.kind].label} tone={KIND_META[item.kind].tone} />}
            renderExpanded={(item) => (
              <>
                <MobileCardField label="Detail" value={describeItem(item, overview)} tone="muted" />
                <Link href={`/orders/${item.orderId}`} className="text-xs font-medium text-primary hover:underline">Open order</Link>
              </>
            )}
          />

          <div className="hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr><ListTh>Needs</ListTh><ListTh>Customer</ListTh><ListTh>Order</ListTh><ListTh>Detail</ListTh><ListTh><span className="sr-only">Open</span></ListTh></tr>
              </thead>
              <tbody>
                {rows.map((item) => <QueueRow key={itemKey(item)} item={item} overview={overview} />)}
              </tbody>
            </table>
          </div>
        </ListTableShell>
      )}

      {capNotes.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          {capNotes.map((n) => `Showing ${n.shown} of ${n.total} ${KIND_META[n.kind].label.toLowerCase()}`).join(' · ')}. <Link href="/orders" className="text-primary hover:underline">See all orders</Link>
        </p>
      )}
    </section>
  );
}

function QueueRow({ item, overview }: { item: DeliveryOverviewQueueItem; overview: Pick<DeliveryOverview, 'generatedAt' | 'timezone'> }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-canvas">
      <td className="px-4 py-2.5 first:pl-5"><StatusBadge label={KIND_META[item.kind].label} tone={KIND_META[item.kind].tone} /></td>
      <td className="px-4 py-2.5 font-medium text-text">{item.customerName}</td>
      <td className="px-4 py-2.5 tabular-nums text-muted">{item.orderNumber}</td>
      <td className="px-4 py-2.5 text-muted">{describeItem(item, overview)}</td>
      <td className="px-4 py-2.5 text-right last:pr-5"><Link href={`/orders/${item.orderId}`} className="whitespace-nowrap text-xs font-medium text-primary hover:underline">Open order</Link></td>
    </tr>
  );
}
