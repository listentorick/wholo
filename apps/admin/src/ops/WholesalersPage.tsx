'use client';

import { useEffect, useState } from 'react';
import type { PlatformDistributor } from '@wholo/types';
import { FilterBar } from '@/components/list/filter-bar/FilterBar';
import type { ActiveFilter, FilterFieldConfig } from '@/components/list/filter-bar/types';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ListPageHeader } from '@/components/list/ListPageHeader';
import { ListRow } from '@/components/list/ListRow';
import { ListSpinner } from '@/components/list/ListSpinner';
import { ListTableShell } from '@/components/list/ListTableShell';
import { ListTh } from '@/components/list/ListTh';
import { MobileCardField } from '@/components/list/MobileCardField';
import { MobileCardList } from '@/components/list/MobileCardList';
import { SegmentedFilter } from '@/components/list/SegmentedFilter';
import { StatusBadge } from '@/components/list/StatusBadge';
import { OpenAccessDialog } from './OpenAccessDialog';
import { opsApi } from './api';
import { enterWholesaler } from './navigation';
import { ATTENTION_LABELS, distributorQuery, lastOrderText, type WholesalerView } from './shaping';
import { formatClock } from './time';

const VIEWS: { value: WholesalerView; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'mine', label: 'I have access' },
];

const FILTER_FIELDS: FilterFieldConfig[] = [
  { field: 'search', label: 'Name', operators: [{ value: 'contains', label: 'contains' }], valueKind: 'text' },
];

function WholesalerBadges({ d }: { d: PlatformDistributor }) {
  if (!d.myActiveGrant && d.attention.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {d.myActiveGrant && <StatusBadge label={`Your access until ${formatClock(d.myActiveGrant.expiresAt)}`} tone="blue" />}
      {d.attention.map((a) => (
        <StatusBadge key={a} label={ATTENTION_LABELS[a]} tone="yellow" />
      ))}
    </span>
  );
}

function WholesalersEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <ListEmptyState
      iconBgClassName="bg-primary/10"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-10 w-10 text-primary" aria-hidden>
          <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
        </svg>
      }
      title={filtered ? 'No wholesalers match' : 'No wholesalers yet'}
      description={filtered ? 'Try another name, or show all wholesalers.' : 'Wholesalers appear here once they sign up.'}
    />
  );
}

export function WholesalersPage() {
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [view, setView] = useState<WholesalerView>('all');
  const [rows, setRows] = useState<PlatformDistributor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    opsApi
      .distributors(distributorQuery(filters, view))
      .then((list) => {
        if (cancelled) return;
        setRows(list);
        setError(null);
      })
      .catch(() => !cancelled && setError('Couldn’t load wholesalers. Please refresh.'));
    return () => {
      cancelled = true;
    };
  }, [filters, view]);

  function action(d: PlatformDistributor) {
    if (d.myActiveGrant) {
      const grant = d.myActiveGrant;
      return (
        <button
          type="button"
          onClick={() => enterWholesaler({ id: grant.id, distributorId: d.id, distributorName: d.name, expiresAt: grant.expiresAt, reason: grant.reason })}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Continue
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setOpening({ id: d.id, name: d.name })}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-canvas"
      >
        Open…
      </button>
    );
  }

  return (
    <>
      <ListPageHeader title="Wholesalers" count={rows?.length} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <FilterBar fields={FILTER_FIELDS} filters={filters} onFiltersChange={setFilters} onClearAll={() => setFilters([])} />
        </div>
        <SegmentedFilter ariaLabel="Show" value={view} options={VIEWS} onChange={setView} />
      </div>

      {error ? (
        <ListErrorBanner message={error} />
      ) : !rows ? (
        <ListSpinner />
      ) : rows.length === 0 ? (
        <WholesalersEmptyState filtered={filters.length > 0 || view !== 'all'} />
      ) : (
        <ListTableShell>
          <MobileCardList
            items={rows}
            getId={(d) => d.id}
            getLabel={(d) => d.name}
            entityLabelPlural="wholesalers"
            renderPrimary={(d) => d.name}
            renderSecondary={(d) => d.ownerEmail ?? 'No Owner'}
            renderStatus={(d) => <WholesalerBadges d={d} />}
            renderMeta={(d) => action(d)}
            renderExpanded={(d) => (
              <div className="grid grid-cols-2 gap-3">
                <MobileCardField label="Customers" value={d.activeCustomers} />
                <MobileCardField label="Products" value={d.products} />
                <MobileCardField label="Orders, 30 days" value={d.ordersLast30Days} />
                <MobileCardField label="Last order" value={lastOrderText(d.lastOrderAt)} />
              </div>
            )}
          />

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead className="border-b border-border bg-[#fafafa]">
                <tr>
                  <ListTh>Wholesaler</ListTh>
                  <ListTh>Customers</ListTh>
                  <ListTh>Products</ListTh>
                  <ListTh>Orders, 30 days</ListTh>
                  <ListTh>Last order</ListTh>
                  <ListTh>
                    <span className="sr-only">Access</span>
                  </ListTh>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <ListRow key={d.id}>
                    <td className="py-3 pl-5 pr-4">
                      <span className="block text-sm font-medium text-text">{d.name}</span>
                      <span className="block text-xs text-muted">{d.ownerEmail ?? 'No Owner'}</span>
                      <span className="mt-1.5 block">
                        <WholesalerBadges d={d} />
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text">{d.activeCustomers}</td>
                    <td className="px-4 py-3 text-sm text-text">{d.products}</td>
                    <td className="px-4 py-3 text-sm text-text">{d.ordersLast30Days}</td>
                    <td className="px-4 py-3 text-sm text-muted">{lastOrderText(d.lastOrderAt)}</td>
                    <td className="py-3 pl-4 pr-5 text-right">{action(d)}</td>
                  </ListRow>
                ))}
              </tbody>
            </table>
          </div>
        </ListTableShell>
      )}

      {opening && <OpenAccessDialog distributor={opening} onClose={() => setOpening(null)} />}
    </>
  );
}
