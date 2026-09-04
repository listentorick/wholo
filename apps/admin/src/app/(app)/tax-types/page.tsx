'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useCursorList } from '@/lib/hooks/use-cursor-list';
import { ListPageHeader } from '@/components/list/ListPageHeader';
import { ListTableShell } from '@/components/list/ListTableShell';
import { ListTh } from '@/components/list/ListTh';
import { ListRow } from '@/components/list/ListRow';
import { ListCellLink } from '@/components/list/ListCellLink';
import { ListPagination } from '@/components/list/ListPagination';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ListSpinner } from '@/components/list/ListSpinner';
import { ListEmptyState } from '@/components/list/ListEmptyState';
import { StatusBadge } from '@/components/list/StatusBadge';
import { adminTaxTypesApi } from '@wholo/admin-api-client';
import type { TaxType } from '@wholo/types';
import { CLASSIFICATION_LABELS } from '@/lib/tax-classification-labels';

// ─── Empty state ──────────────────────────────────────────────────────────────

function TaxTypesEmptyState() {
  return (
    <ListEmptyState
      iconBgClassName="bg-[#eff6ff]"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth={1.5} className="h-8 w-8" aria-hidden>
          <line x1="19" y1="5" x2="5" y2="19" />
          <circle cx="6.5" cy="6.5" r="2.5" />
          <circle cx="17.5" cy="17.5" r="2.5" />
        </svg>
      }
      title="No tax types yet"
      description="Tax types tell Stocdup how much tax to add on top of a product's price. Create one and assign it to your products."
      action={
        <Link
          href="/tax-types/new"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Create first tax type
        </Link>
      }
    />
  );
}

// ─── Tax type row ─────────────────────────────────────────────────────────────

function TaxTypeRow({ taxType }: { taxType: TaxType }) {
  const href = `/tax-types/${taxType.id}/edit`;
  return (
    <ListRow>
      <td className="py-3 pl-5 pr-4">
        <ListCellLink href={href}>
          <div className="flex items-center gap-2">
            <span className="block font-medium text-text text-sm group-hover:text-primary transition-colors">
              {taxType.name}
            </span>
            {taxType.isDefault && <StatusBadge label="Needs review" tone="yellow" />}
          </div>
        </ListCellLink>
      </td>
      <td className="py-3 px-4">
        <ListCellLink href={href} className="text-sm text-text">
          {CLASSIFICATION_LABELS[taxType.classification] ?? taxType.classification}
        </ListCellLink>
      </td>
      <td className="py-3 px-4">
        <ListCellLink href={href} className="text-sm text-text font-mono">
          {taxType.ratePercentage}%
        </ListCellLink>
      </td>
      <td className="py-3 px-4">
        <ListCellLink href={href}>
          <StatusBadge label={taxType.active ? 'Active' : 'Inactive'} tone={taxType.active ? 'green' : 'gray'} />
        </ListCellLink>
      </td>
    </ListRow>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TaxTypesPage() {
  const { accessToken } = useAuth();

  const buildParams = useCallback((cursor: string | undefined) => ({ limit: 50, cursor }), []);

  const {
    data: taxTypes,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  } = useCursorList({
        enabled: !!accessToken,
    fetchPage: adminTaxTypesApi.list,
    buildParams,
    errorMessage: 'Failed to load tax types. Please refresh.',
    deps: [],
  });

  return (
    <>
      <ListPageHeader
        title="Tax types"
        count={!isLoading ? total : undefined}
        actions={
          <Link
            href="/tax-types/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            New tax type
          </Link>
        }
      />

      {isLoading ? (
        <ListSpinner />
      ) : error ? (
        <ListErrorBanner message={error} />
      ) : taxTypes.length === 0 ? (
        <TaxTypesEmptyState />
      ) : (
        <ListTableShell>
          <table className="w-full text-left">
            <thead className="border-b border-border bg-[#fafafa]">
              <tr>
                <ListTh>Name</ListTh>
                <ListTh>Classification</ListTh>
                <ListTh>Rate</ListTh>
                <ListTh>Status</ListTh>
              </tr>
            </thead>
            <tbody>
              {taxTypes.map((tt) => (
                <TaxTypeRow key={tt.id} taxType={tt} />
              ))}
            </tbody>
          </table>
          <ListPagination hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} />
        </ListTableShell>
      )}
    </>
  );
}
