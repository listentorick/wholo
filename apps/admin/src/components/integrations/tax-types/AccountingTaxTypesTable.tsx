'use client';

import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingTaxTypeStatus, AccountingTaxTypeSummary } from '@wholo/types';
import { ListTableShell } from '@/components/list/ListTableShell';
import { ListTh } from '@/components/list/ListTh';
import { ListSpinner } from '@/components/list/ListSpinner';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { ListPagination } from '@/components/list/ListPagination';
import { StatusBadge, type StatusTone } from '@/components/list/StatusBadge';
import { MobileCardList } from '@/components/list/MobileCardList';
import { MobileCardField } from '@/components/list/MobileCardField';
import { ChangedIndicator, isRowChanged } from '@/components/integrations/ChangedIndicator';
import { TaxTypeRowActions } from './TaxTypeRowActions';

interface Props {
  taxTypes: AccountingTaxTypeSummary[];
  loading: boolean;
  hasFilter: boolean;
  providerLabel: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onActionComplete: () => void;
}

const STATUS_META: Record<AccountingTaxTypeStatus, { label: string; tone: StatusTone }> = {
  LINKED: { label: 'Already linked', tone: 'green' },
  SUGGESTED: { label: 'Suggested match', tone: 'blue' },
  READY_TO_IMPORT: { label: 'Ready to import', tone: 'orange' },
  IGNORED: { label: 'Ignored', tone: 'gray' },
  INACTIVE: { label: 'No longer in provider', tone: 'gray' },
  CONFLICT: { label: 'Conflict', tone: 'red' },
};

function TaxTypeStatusBadge({ status }: { status: AccountingTaxTypeStatus }) {
  const meta = STATUS_META[status];
  return <StatusBadge label={meta.label} tone={meta.tone} />;
}

const COLUMNS = ['Accounting tax type', 'Rate', 'Suggested tax type', 'Match reason', 'Status', 'Actions'];

export function AccountingTaxTypesTable({
  taxTypes,
  loading,
  hasFilter,
  providerLabel,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onActionComplete,
}: Props) {
  if (loading && taxTypes.length === 0) {
    return <ListSpinner />;
  }

  if (taxTypes.length === 0) {
    return (
      <ListEmptyState
        iconBgClassName="bg-[#f3f4f6]"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={1.5} className="h-9 w-9" aria-hidden>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <path d="M9 3a2 2 0 012-2h2a2 2 0 012 2v2H9V3z" />
            <path d="M9 12h6M9 16h6" strokeLinecap="round" />
          </svg>
        }
        title={hasFilter ? 'No matching tax types' : 'No tax types synced yet'}
        description={hasFilter ? 'Try adjusting or clearing your filters.' : `Click Sync now to pull tax types from ${providerLabel}.`}
      />
    );
  }

  return (
    <ListTableShell>
      <MobileCardList
        items={taxTypes}
        getId={(taxType) => taxType.id}
        getLabel={(taxType) => taxType.displayName}
        entityLabelPlural="tax types"
        isChanged={(taxType) => isRowChanged(taxType.changeDetectedAt, taxType.changeAcknowledgedAt)}
        renderPrimary={(taxType) => taxType.displayName}
        renderSecondary={(taxType) => `${taxType.ratePercentage}%`}
        renderStatus={(taxType) => <TaxTypeStatusBadge status={taxType.status} />}
        renderMeta={(taxType) => (
          <ChangedIndicator
            changeDetectedAt={taxType.changeDetectedAt}
            changeAcknowledgedAt={taxType.changeAcknowledgedAt}
            onAcknowledge={() => adminAccountingApi.acknowledgeTaxTypeChange(taxType.id).then(onActionComplete)}
          />
        )}
        renderExpanded={(taxType) => (
          <>
            <MobileCardField label="Provider code" value={taxType.taxType} mono />
            <MobileCardField
              label="Suggested tax type"
              value={taxType.mapping?.taxTypeName ?? taxType.suggestion?.taxTypeName ?? '—'}
            />
            <MobileCardField
              label="Match reason"
              tone="muted"
              value={taxType.suggestion?.matchReason ?? (taxType.mapping ? `Linked (${taxType.mapping.matchMethod})` : '—')}
            />
            <TaxTypeRowActions
              taxType={taxType}
             
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
              {COLUMNS.map((h) => (
                <ListTh key={h}>{h}</ListTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {taxTypes.map((taxType) => {
              const changed = isRowChanged(taxType.changeDetectedAt, taxType.changeAcknowledgedAt);
              return (
                <tr
                  key={taxType.id}
                  className={[
                    'border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors',
                    changed ? 'border-l-2 border-l-amber-400' : '',
                  ].join(' ')}
                >
                  <td className="py-3 px-4 text-sm font-medium text-text">
                    {taxType.displayName}
                    <div className="text-xs text-muted">{taxType.taxType}</div>
                    <ChangedIndicator
                      changeDetectedAt={taxType.changeDetectedAt}
                      changeAcknowledgedAt={taxType.changeAcknowledgedAt}
                      onAcknowledge={() => adminAccountingApi.acknowledgeTaxTypeChange(taxType.id).then(onActionComplete)}
                    />
                  </td>
                  <td className="py-3 px-4 text-sm text-muted">{taxType.ratePercentage}%</td>
                  <td className="py-3 px-4 text-sm text-text">
                    {taxType.mapping?.taxTypeName ?? taxType.suggestion?.taxTypeName ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted max-w-[220px]">
                    {taxType.suggestion?.matchReason ?? (taxType.mapping ? `Linked (${taxType.mapping.matchMethod})` : '—')}
                  </td>
                  <td className="py-3 px-4">
                    <TaxTypeStatusBadge status={taxType.status} />
                  </td>
                  <td className="py-3 pl-4 pr-5">
                    <TaxTypeRowActions
                      taxType={taxType}
                     
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
