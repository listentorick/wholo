'use client';

import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingContactStatus, AccountingContactSummary } from '@wholo/types';
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
import { ContactRowActions } from './ContactRowActions';

interface Props {
  contacts: AccountingContactSummary[];
  loading: boolean;
  hasFilter: boolean;
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

const STATUS_META: Record<AccountingContactStatus, { label: string; tone: StatusTone }> = {
  LINKED: { label: 'Already linked', tone: 'green' },
  SUGGESTED: { label: 'Suggested match', tone: 'blue' },
  READY_TO_IMPORT: { label: 'Ready to import', tone: 'orange' },
  NOT_A_CUSTOMER: { label: 'Not a customer', tone: 'gray' },
  IGNORED: { label: 'Ignored', tone: 'gray' },
  ARCHIVED: { label: 'Archived', tone: 'gray' },
  CONFLICT: { label: 'Conflict', tone: 'red' },
};

function ContactStatusBadge({ status }: { status: AccountingContactStatus }) {
  const meta = STATUS_META[status];
  return <StatusBadge label={meta.label} tone={meta.tone} />;
}

const COLUMNS = ['Accounting contact', 'Email', 'Account number', 'Suggested customer', 'Match reason', 'Status', 'Actions'];

export function AccountingContactsTable({
  contacts,
  loading,
  hasFilter,
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
  if (loading && contacts.length === 0) {
    return <ListSpinner />;
  }

  if (contacts.length === 0) {
    return (
      <ListEmptyState
        iconBgClassName="bg-[#f3f4f6]"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={1.5} className="h-9 w-9" aria-hidden>
            <path d="M4 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />
            <path d="M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
        title={hasFilter ? 'No matching contacts' : 'No contacts synced yet'}
        description={hasFilter ? 'Try adjusting or clearing your filters.' : `Click Sync now to pull contacts from ${providerLabel}.`}
      />
    );
  }

  const loadedIds = contacts.map((c) => c.id);
  const allLoadedSelected = loadedIds.length > 0 && loadedIds.every((id) => selectedIds.has(id));
  const headerChecked = selectAllMatching || allLoadedSelected;
  const headerIndeterminate = !headerChecked && loadedIds.some((id) => selectedIds.has(id));
  const showSelectAllBanner = hasMore && headerChecked && !selectAllMatching;

  return (
    <ListTableShell>
      <MobileCardList
        items={contacts}
        getId={(contact) => contact.id}
        getLabel={(contact) => contact.displayName}
        entityLabelPlural="contacts"
        isChanged={(contact) => isRowChanged(contact.changeDetectedAt, contact.changeAcknowledgedAt)}
        selection={{ selectedIds, selectAllMatching, total, hasMore, onToggleRow, onToggleAllLoaded, onSelectAllMatching }}
        renderPrimary={(contact) => contact.displayName}
        renderSecondary={(contact) => contact.email ?? '—'}
        renderStatus={(contact) => <ContactStatusBadge status={contact.status} />}
        renderMeta={(contact) => (
          <ChangedIndicator
            changeDetectedAt={contact.changeDetectedAt}
            changeAcknowledgedAt={contact.changeAcknowledgedAt}
            onAcknowledge={() => adminAccountingApi.acknowledgeContactChange(contact.id).then(onActionComplete)}
          />
        )}
        renderExpanded={(contact) => (
          <>
            <MobileCardField
              label="Account number"
              value={contact.externalContactCode ?? contact.externalAccountNumber ?? '—'}
              mono
            />
            <MobileCardField
              label="Suggested customer"
              value={contact.mapping?.customerName ?? contact.suggestion?.customerName ?? '—'}
            />
            <MobileCardField
              label="Match reason"
              tone="muted"
              value={contact.suggestion?.matchReason ?? (contact.mapping ? `Linked (${contact.mapping.matchMethod})` : '—')}
            />
            <ContactRowActions
              contact={contact}
             
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
                  ariaLabel="Select all loaded contacts"
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
                  All {loadedIds.length} loaded contacts are selected.{' '}
                  <button type="button" onClick={onSelectAllMatching} className="font-medium text-primary hover:underline">
                    Select all {total} contacts matching filters
                  </button>
                </td>
              </tr>
            </tbody>
          )}
          <tbody>
            {contacts.map((contact) => {
              const changed = isRowChanged(contact.changeDetectedAt, contact.changeAcknowledgedAt);
              return (
                <tr
                  key={contact.id}
                  className={[
                    'border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors',
                    changed ? 'border-l-2 border-l-amber-400' : '',
                  ].join(' ')}
                >
                  <td className="py-3 pl-5 pr-2">
                    <input
                      type="checkbox"
                      checked={selectAllMatching || selectedIds.has(contact.id)}
                      onChange={() => onToggleRow(contact.id)}
                      className="h-3.5 w-3.5 accent-primary"
                      aria-label={`Select ${contact.displayName}`}
                    />
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-text">
                    {contact.displayName}
                    <ChangedIndicator
                      changeDetectedAt={contact.changeDetectedAt}
                      changeAcknowledgedAt={contact.changeAcknowledgedAt}
                      onAcknowledge={() => adminAccountingApi.acknowledgeContactChange(contact.id).then(onActionComplete)}
                    />
                  </td>
                  <td className="py-3 px-4 text-sm text-muted">{contact.email ?? '—'}</td>
                  <td className="py-3 px-4 text-sm text-muted">
                    {contact.externalContactCode ?? contact.externalAccountNumber ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-text">
                    {contact.mapping?.customerName ?? contact.suggestion?.customerName ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted max-w-[220px]">
                    {contact.suggestion?.matchReason ?? (contact.mapping ? `Linked (${contact.mapping.matchMethod})` : '—')}
                  </td>
                  <td className="py-3 px-4">
                    <ContactStatusBadge status={contact.status} />
                  </td>
                  <td className="py-3 pl-4 pr-5">
                    <ContactRowActions
                      contact={contact}
                     
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
