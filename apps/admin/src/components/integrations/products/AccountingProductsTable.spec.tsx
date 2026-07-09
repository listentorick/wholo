import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccountingProductsTable } from './AccountingProductsTable';
import type { AccountingProductSummary } from '@wholo/types';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: {
    confirmProductSuggestion: vi.fn(),
    ignoreProduct: vi.fn(),
    unlinkProductMapping: vi.fn(),
    importProduct: vi.fn(),
    matchProduct: vi.fn(),
  },
  adminProductsApi: {
    list: vi.fn().mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, total: 0 } }),
  },
}));

function makeProduct(overrides: Partial<AccountingProductSummary> = {}): AccountingProductSummary {
  return {
    id: 'ext-1',
    displayName: 'Cabernet Sauvignon 2023',
    description: null,
    externalProductCode: 'CAB-SAUV-001',
    salesUnitPrice: '12.3456',
    quantityOnHand: '42.5',
    isSold: true,
    isPurchased: true,
    isTracked: true,
    isActive: true,
    ignoredAt: null,
    status: 'READY_TO_IMPORT',
    mapping: null,
    suggestion: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountingProductsTable', () => {
  it('renders code, name, price and tracked quantity for each row', () => {
    render(
      <AccountingProductsTable
        products={[makeProduct()]}
        loading={false}
        hasFilter={false}
        token="token-1"
        onActionComplete={() => {}}
      />,
    );

    expect(screen.getByText('CAB-SAUV-001')).toBeInTheDocument();
    expect(screen.getByText('Cabernet Sauvignon 2023')).toBeInTheDocument();
    expect(screen.getByText('12.3456')).toBeInTheDocument();
    expect(screen.getByText('42.5')).toBeInTheDocument();
    expect(screen.getByText('Ready to import')).toBeInTheDocument();
  });

  it('shows a dash for stock when the item is not tracked', () => {
    render(
      <AccountingProductsTable
        products={[makeProduct({ isTracked: false })]}
        loading={false}
        hasFilter={false}
        token="token-1"
        onActionComplete={() => {}}
      />,
    );

    const row = screen.getByText('Cabernet Sauvignon 2023').closest('tr')!;
    expect(row.textContent).not.toContain('42.5');
  });

  it('shows the suggested product name and its status badge', () => {
    render(
      <AccountingProductsTable
        products={[
          makeProduct({
            status: 'SUGGESTED',
            suggestion: {
              id: 'sugg-1',
              productId: 'prod-1',
              productName: 'Cab Sauv (Wholo)',
              confidence: 95,
              matchMethod: 'SKU_EXACT',
              matchReason: 'Item code matches the product SKU exactly',
            },
          }),
        ]}
        loading={false}
        hasFilter={false}
        token="token-1"
        onActionComplete={() => {}}
      />,
    );

    expect(screen.getByText('Cab Sauv (Wholo)')).toBeInTheDocument();
    expect(screen.getByText('Suggested match')).toBeInTheDocument();
  });

  it('shows the linked product name for a mapped row', () => {
    render(
      <AccountingProductsTable
        products={[
          makeProduct({
            status: 'LINKED',
            mapping: {
              id: 'map-1',
              productId: 'prod-1',
              productName: 'Cab Sauv (Wholo)',
              matchMethod: 'MANUAL',
              linkedAt: '2026-01-01T00:00:00.000Z',
            },
          }),
        ]}
        loading={false}
        hasFilter={false}
        token="token-1"
        onActionComplete={() => {}}
      />,
    );

    expect(screen.getByText('Cab Sauv (Wholo)')).toBeInTheDocument();
    expect(screen.getByText('Already linked')).toBeInTheDocument();
  });

  it('shows the unfiltered empty state pointing at Sync now', () => {
    render(
      <AccountingProductsTable products={[]} loading={false} hasFilter={false} token="token-1" onActionComplete={() => {}} />,
    );
    expect(screen.getByText('No products synced yet')).toBeInTheDocument();
    expect(screen.getByText(/Click Sync now/)).toBeInTheDocument();
  });

  it('shows the filtered empty state when a filter is active', () => {
    render(
      <AccountingProductsTable products={[]} loading={true} hasFilter={true} token="token-1" onActionComplete={() => {}} />,
    );
    // hasFilter takes effect once loading finishes with no rows
    render(
      <AccountingProductsTable products={[]} loading={false} hasFilter={true} token="token-1" onActionComplete={() => {}} />,
    );
    expect(screen.getByText('No matching products')).toBeInTheDocument();
  });
});
