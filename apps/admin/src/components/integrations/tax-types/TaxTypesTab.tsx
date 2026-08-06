'use client';

import { useCallback, useState } from 'react';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { AccountingTaxTypeListParams } from '@wholo/types';
import { useCursorList } from '@/lib/hooks/use-cursor-list';
import { AccountingTaxTypesTable } from './AccountingTaxTypesTable';

interface Props {
  token: string;
  providerLabel: string;
  onTaxTypesChanged?: () => void;
}

export function TaxTypesTab({ token, providerLabel, onTaxTypesChanged }: Props) {
  const [reloadToken, setReloadToken] = useState(0);

  const buildParams = useCallback((cursor: string | undefined): AccountingTaxTypeListParams => ({ limit: 20, cursor }), []);

  const {
    data: taxTypes,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
  } = useCursorList({
    token,
    fetchPage: (activeToken, params) => adminAccountingApi.listTaxTypes(params, activeToken),
    buildParams,
    errorMessage: 'Failed to load tax rates. Please refresh.',
    deps: [reloadToken],
  });

  function handleActionComplete() {
    setReloadToken((t) => t + 1);
    onTaxTypesChanged?.();
  }

  return (
    <div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : (
        <AccountingTaxTypesTable
          taxTypes={taxTypes}
          loading={isLoading}
          hasFilter={false}
          token={token}
          providerLabel={providerLabel}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMore}
          onActionComplete={handleActionComplete}
        />
      )}
    </div>
  );
}
