import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductsTab } from './ProductsTab';
import { adminAccountingApi } from '@wholo/admin-api-client';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: {
    listProducts: vi.fn(),
    syncProducts: vi.fn(),
  },
}));

const mockListProducts = adminAccountingApi.listProducts as ReturnType<typeof vi.fn>;

function makeProduct(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    displayName: `Product ${id}`,
    description: null,
    externalProductCode: null,
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProductsTab', () => {
  it('loads and renders products on mount', async () => {
    mockListProducts.mockResolvedValue({
      data: [makeProduct('p1')],
      pagination: { nextCursor: null, hasMore: false },
    });

    render(<ProductsTab token="token-1" />);

    await waitFor(() => expect(screen.getByText('Product p1')).toBeInTheDocument());
    expect(mockListProducts).toHaveBeenCalledWith(
      { limit: 20, cursor: undefined, status: undefined, type: undefined },
      'token-1',
    );
  });

  it('shows an error banner when the initial load fails', async () => {
    mockListProducts.mockRejectedValue(new Error('boom'));
    render(<ProductsTab token="token-1" />);
    await waitFor(() => expect(screen.getByText(/Failed to load products/)).toBeInTheDocument());
  });

  it('re-fetches with the selected status filter', async () => {
    mockListProducts.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });
    const user = userEvent.setup();

    render(<ProductsTab token="token-1" />);
    await waitFor(() => expect(mockListProducts).toHaveBeenCalledTimes(1));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'SUGGESTED');

    await waitFor(() =>
      expect(mockListProducts).toHaveBeenLastCalledWith(
        { limit: 20, cursor: undefined, status: 'SUGGESTED', type: undefined },
        'token-1',
      ),
    );
  });

  it('re-fetches with the selected type filter, composing with the status filter', async () => {
    mockListProducts.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });
    const user = userEvent.setup();

    render(<ProductsTab token="token-1" />);
    await waitFor(() => expect(mockListProducts).toHaveBeenCalledTimes(1));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by type' }), 'tracked');

    await waitFor(() =>
      expect(mockListProducts).toHaveBeenLastCalledWith(
        { limit: 20, cursor: undefined, status: undefined, type: 'tracked' },
        'token-1',
      ),
    );
  });

  it('loads the next page and appends results on Load more', async () => {
    mockListProducts
      .mockResolvedValueOnce({ data: [makeProduct('p1')], pagination: { nextCursor: 'cursor-2', hasMore: true } })
      .mockResolvedValueOnce({ data: [makeProduct('p2')], pagination: { nextCursor: null, hasMore: false } });
    const user = userEvent.setup();

    render(<ProductsTab token="token-1" />);
    await waitFor(() => expect(screen.getByText('Product p1')).toBeInTheDocument());
    expect(screen.getByText('Load more')).toBeInTheDocument();

    await user.click(screen.getByText('Load more'));

    await waitFor(() => expect(screen.getByText('Product p2')).toBeInTheDocument());
    expect(screen.getByText('Product p1')).toBeInTheDocument();
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });
});
