'use client';

import type { AccountingContactStatus, AccountingContactSummary } from '@wholo/types';
import { ContactRowActions } from './ContactRowActions';

interface Props {
  contacts: AccountingContactSummary[];
  loading: boolean;
  hasFilter: boolean;
  token: string;
  onActionComplete: () => void;
}

const STATUS_META: Record<AccountingContactStatus, { label: string; bg: string; text: string }> = {
  LINKED: { label: 'Already linked', bg: '#dcfce7', text: '#15803d' },
  SUGGESTED: { label: 'Suggested match', bg: '#dbeafe', text: '#1d4ed8' },
  READY_TO_IMPORT: { label: 'Ready to import', bg: '#fef3ec', text: '#d97036' },
  NOT_A_CUSTOMER: { label: 'Not a customer', bg: '#f3f4f6', text: '#6b7280' },
  IGNORED: { label: 'Ignored', bg: '#f3f4f6', text: '#6b7280' },
  ARCHIVED: { label: 'Archived', bg: '#f3f4f6', text: '#6b7280' },
  CONFLICT: { label: 'Conflict', bg: '#fee2e2', text: '#b91c1c' },
};

function StatusBadge({ status }: { status: AccountingContactStatus }) {
  const s = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.text }} />
      {s.label}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {[140, 160, 100, 140, 160, 90].map((w, i) => (
        <td key={i} className="py-3.5 px-4">
          <div className="h-3.5 animate-pulse rounded bg-border" style={{ width: w }} />
        </td>
      ))}
      <td className="py-3.5 px-4">
        <div className="h-3.5 w-24 animate-pulse rounded bg-border" />
      </td>
    </tr>
  );
}

const COLUMNS = ['Accounting contact', 'Email', 'Account number', 'Suggested customer', 'Match reason', 'Status', 'Actions'];

export function AccountingContactsTable({ contacts, loading, hasFilter, token, onActionComplete }: Props) {
  if (loading && contacts.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-white overflow-hidden">
        <table className="w-full text-left">
          <thead className="border-b border-border bg-[#fafafa]">
            <tr>
              {COLUMNS.map((h) => (
                <th key={h} className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted first:pl-5 last:pr-5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2].map((i) => <SkeletonRow key={i} />)}
          </tbody>
        </table>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-white py-16 px-8 text-center">
        <h2 className="mb-1.5 text-base font-semibold text-text">
          {hasFilter ? 'No matching contacts' : 'No contacts synced yet'}
        </h2>
        <p className="text-sm text-muted">
          {hasFilter
            ? 'Try a different filter.'
            : 'Click Sync now to pull contacts from Xero.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-white overflow-hidden">
      <table className="w-full text-left">
        <thead className="border-b border-border bg-[#fafafa]">
          <tr>
            {COLUMNS.map((h) => (
              <th key={h} className="py-2.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted first:pl-5 last:pr-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr key={contact.id} className="border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors">
              <td className="py-3 pl-5 pr-4 text-sm font-medium text-text">{contact.displayName}</td>
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
                <StatusBadge status={contact.status} />
              </td>
              <td className="py-3 pl-4 pr-5">
                <ContactRowActions contact={contact} token={token} onActionComplete={onActionComplete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
