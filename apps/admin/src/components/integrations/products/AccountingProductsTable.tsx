'use client';

import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingProductStatus, AccountingProductSummary } from '@wholo/types';
import { ListTableShell } from '@/components/list/ListTableShell';
import { ListTh } from '@/components/list/ListTh';
import { ListSpinner } from '@/components/list/ListSpinner';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ListPagination } from '@/components/list/ListPagination';
import { StatusBadge, type StatusTone } from '@/components/list/StatusBadge';
import { HeaderCheckbox } from '@/components/list/HeaderCheckbox';
import { MobileCardList } from '@/components/list/MobileCardList';
import { MobileCardField } from '@/components/list/MobileCardField';
import { ChangedIndicator, isRowChanged } from '@/components/integrations/ChangedIndicator';
import { ProductRowActions } from './ProductRowActions';

interface Props {
  products: AccountingProductSummary[];
  loading: boolean;
  hasFilter: boolean;
  token: string;
  providerLabel: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onActionComplete: () => void;
  selectedIds: Set<string>;
  selectAllMatching: boolean;
  total: number;
  onToggleRow: (id: string) => void;
  onToggleAllLoaded: (checked: boolean) => void;
  onSelectAllMatching: () => void;
}

const STATUS_META: Record<AccountingProductStatus, { label: string; tone: StatusTone }> = {
  LINKED: { label: 'Already linked', tone: 'green' },
  SUGGESTED: { label: 'Suggested match', tone: 'blue' },
  READY_TO_IMPORT: { label: 'Ready to import', tone: 'orange' },
  NOT_SOLD: { label: 'Not sold', tone: 'gray' },
  IGNORED: { label: 'Ignored', tone: 'gray' },
  INACTIVE: { label: 'No longer in provider', tone: 'gray' },
  CONFLICT: { label: 'Conflict', tone: 'red' },
};

function ProductStatusBadge({ status }: { status: AccountingProductStatus }) {
  const meta = STATUS_META[status];
  return <StatusBadge label={meta.label} tone={meta.tone} />;
}

const COLUMNS = ['Item code', 'Accounting product', 'Sales price', 'Stock', 'Suggested product', 'Status', 'Actions'];

export function AccountingProductsTable({
  products,
  loading,
  hasFilter,
  token,
  providerLabel,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onActionComplete,
  selectedIds,
  selectAllMatching,
  total,
  onToggleRow,
  onToggleAllLoaded,
  onSelectAllMatching,
}: Props) {
  if (loading && products.length === 0) {
    return <ListSpinner />;
  }

  if (products.length === 0) {
    return (
      <ListEmptyState
        iconBgClassName="bg-[#f3f4f6]"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={1.5} className="h-9 w-9" aria-hidden>
            <path d="M4 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />
            <path d="M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
        title={hasFilter ? 'No matching products' : 'No products synced yet'}
        description={hasFilter ? 'Try adjusting or clearing your filters.' : `Click Sync now to pull products from ${providerLabel}.`}
      />
    );
  }

  const loadedIds = products.map((p) => p.id);
  const allLoadedSelected = loadedIds.length > 0 && loadedIds.every((id) => selectedIds.has(id));
  const headerChecked = selectAllMatching || allLoadedSelected;
  const headerIndeterminate = !headerChecked && loadedIds.some((id) => selectedIds.has(id));
  const showSelectAllBanner = hasMore && headerChecked && !selectAllMatching;

  return (
    <ListTableShell>
      <MobileCardList
        items={products}
        getId={(product) => product.id}
        getLabel={(product) => product.displayName}
        entityLabelPlural="products"
        isChanged={(product) => isRowChanged(product.changeDetectedAt, product.changeAcknowledgedAt)}
        selection={{ selectedIds, selectAllMatching, total, hasMore, onToggleRow, onToggleAllLoaded, onSelectAllMatching }}
        renderPrimary={(product) => product.displayName}
        renderSecondary={(product) => product.externalProductCode ?? '—'}
        renderStatus={(product) => <ProductStatusBadge status={product.status} />}
        renderMeta={(product) => (
          <ChangedIndicator
            changeDetectedAt={product.changeDetectedAt}
            changeAcknowledgedAt={product.changeAcknowledgedAt}
            onAcknowledge={() => adminAccountingApi.acknowledgeProductChange(product.id, token).then(onActionComplete)}
          />
        )}
        renderExpanded={(product) => (
          <>
            <MobileCardField label="Sales price" value={product.salesUnitPrice ?? '—'} />
            <MobileCardField label="Stock" value={product.isTracked ? product.quantityOnHand ?? '0' : '—'} />
            <MobileCardField
              label="Suggested product"
              value={product.mapping?.productName ?? product.suggestion?.productName ?? '—'}
            />
            <ProductRowActions
              product={product}
              token={token}
              providerLabel={providerLabel}
              onActionComplete={onActionComplete}
            />
          </>
        )}
      />

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left">
          <thead className="border-b border-border bg-[#fafafa]">
            <tr>
              <th className="w-10 py-3 pl-5 pr-2">
                <HeaderCheckbox
                  checked={headerChecked}
                  indeterminate={headerIndeterminate}
                  onChange={onToggleAllLoaded}
                  ariaLabel="Select all loaded products"
                />
              </th>
              {COLUMNS.map((h) => (
                <ListTh key={h}>{h}</ListTh>
              ))}
            </tr>
          </thead>
          {showSelectAllBanner && (
            <tbody>
              <tr className="border-b border-border bg-primary/5">
                <td colSpan={COLUMNS.length + 1} className="py-2 px-5 text-xs text-text">
                  All {loadedIds.length} loaded products are selected.{' '}
                  <button type="button" onClick={onSelectAllMatching} className="font-medium text-primary hover:underline">
                    Select all {total} products matching filters
                  </button>
                </td>
              </tr>
            </tbody>
          )}
          <tbody>
            {products.map((product) => {
              const changed = isRowChanged(product.changeDetectedAt, product.changeAcknowledgedAt);
              return (
                <tr
                  key={product.id}
                  className={[
                    'border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors',
                    changed ? 'border-l-2 border-l-amber-400' : '',
                  ].join(' ')}
                >
                  <td className="py-3 pl-5 pr-2">
                    <input
                      type="checkbox"
                      checked={selectAllMatching || selectedIds.has(product.id)}
                      onChange={() => onToggleRow(product.id)}
                      className="h-3.5 w-3.5 accent-primary"
                      aria-label={`Select ${product.displayName}`}
                    />
                  </td>
                  <td className="py-3 px-4 text-sm text-muted">{product.externalProductCode ?? '—'}</td>
                  <td className="py-3 px-4 text-sm font-medium text-text">
                    {product.displayName}
                    <ChangedIndicator
                      changeDetectedAt={product.changeDetectedAt}
                      changeAcknowledgedAt={product.changeAcknowledgedAt}
                      onAcknowledge={() => adminAccountingApi.acknowledgeProductChange(product.id, token).then(onActionComplete)}
                    />
                  </td>
                  <td className="py-3 px-4 text-sm text-muted">{product.salesUnitPrice ?? '—'}</td>
                  <td className="py-3 px-4 text-sm text-muted">
                    {product.isTracked ? product.quantityOnHand ?? '0' : '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-text">
                    {product.mapping?.productName ?? product.suggestion?.productName ?? '—'}
                  </td>
                  <td className="py-3 px-4">
                    <ProductStatusBadge status={product.status} />
                  </td>
                  <td className="py-3 pl-4 pr-5">
                    <ProductRowActions
                      product={product}
                      token={token}
                      providerLabel={providerLabel}
                      onActionComplete={onActionComplete}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ListPagination hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={onLoadMore} />
    </ListTableShell>
  );
}
