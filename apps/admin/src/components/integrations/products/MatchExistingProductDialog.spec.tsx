import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchExistingProductDialog } from './MatchExistingProductDialog';
import { adminAccountingApi, adminProductsApi } from '@wholo/admin-api-client';
import type { AccountingProductSummary } from '@wholo/types';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: { matchProduct: vi.fn() },
  adminProductsApi: { list: vi.fn() },
}));

const external: AccountingProductSummary = {
  id: 'ext-1',
  displayName: 'Cabernet Sauvignon 2023',
  description: null,
  externalProductCode: 'CAB-SAUV-001',
  salesUnitPrice: null,
  quantityOnHand: null,
  isSold: true,
  isPurchased: true,
  isTracked: false,
  isActive: true,
  ignoredAt: null,
  status: 'READY_TO_IMPORT',
  mapping: null,
  suggestion: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeWholoProduct(id: string, name: string, sku: string | null = null) {
  return { id, name, sku };
}

beforeEach(() => {
  vi.clearAllMocks();
  (adminProductsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [makeWholoProduct('prod-1', 'Cabernet Sauvignon 2023', 'CAB-SAUV-001'), makeWholoProduct('prod-2', 'Merlot Case', 'MERLOT-CASE')],
    pagination: { nextCursor: null, hasMore: false, total: 2 },
  });
});

describe('MatchExistingProductDialog', () => {
  it('loads and lists the distributor products', async () => {
    render(<MatchExistingProductDialog product={external} token="token-1" onClose={() => {}} onMatched={() => {}} />);

    await waitFor(() => expect(screen.getByText('Cabernet Sauvignon 2023', { selector: 'span' })).toBeInTheDocument());
    expect(screen.getByText('Merlot Case')).toBeInTheDocument();
    expect(adminProductsApi.list).toHaveBeenCalledWith('token-1', { limit: 100 });
  });

  it('filters products by name or SKU client-side', async () => {
    const user = userEvent.setup();
    render(<MatchExistingProductDialog product={external} token="token-1" onClose={() => {}} onMatched={() => {}} />);
    await waitFor(() => expect(screen.getByText('Merlot Case')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Search products'), 'MERLOT');

    expect(screen.getByText('Merlot Case')).toBeInTheDocument();
    expect(screen.queryByText('Cabernet Sauvignon 2023', { selector: 'span.font-medium' })).not.toBeInTheDocument();
  });

  it('links the selected product and calls onMatched', async () => {
    (adminAccountingApi.matchProduct as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const onMatched = vi.fn();
    const user = userEvent.setup();

    render(<MatchExistingProductDialog product={external} token="token-1" onClose={() => {}} onMatched={onMatched} />);
    await waitFor(() => expect(screen.getByText('Merlot Case')).toBeInTheDocument());

    await user.click(screen.getByText('Merlot Case'));
    await user.click(screen.getByText('Link product'));

    await waitFor(() =>
      expect(adminAccountingApi.matchProduct).toHaveBeenCalledWith('ext-1', { productId: 'prod-2' }, 'token-1'),
    );
    await waitFor(() => expect(onMatched).toHaveBeenCalled());
  });

  it('disables the link button until a product is selected', async () => {
    render(<MatchExistingProductDialog product={external} token="token-1" onClose={() => {}} onMatched={() => {}} />);
    await waitFor(() => expect(screen.getByText('Merlot Case')).toBeInTheDocument());

    expect(screen.getByText('Link product')).toBeDisabled();
  });

  it('shows an error when linking fails', async () => {
    (adminAccountingApi.matchProduct as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<MatchExistingProductDialog product={external} token="token-1" onClose={() => {}} onMatched={() => {}} />);
    await waitFor(() => expect(screen.getByText('Merlot Case')).toBeInTheDocument());

    await user.click(screen.getByText('Merlot Case'));
    await user.click(screen.getByText('Link product'));

    await waitFor(() => expect(screen.getByText(/Failed to link this product/)).toBeInTheDocument());
  });
});
