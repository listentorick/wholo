import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductsTab } from './ProductsTab';
import { adminAccountingApi } from '@wholo/admin-api-client';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: {
    listProducts: vi.fn(),
    syncProducts: vi.fn(),
    bulkImportProducts: vi.fn(),
  },
}));

const mockListProducts = adminAccountingApi.listProducts as ReturnType<typeof vi.fn>;
const mockBulkImportProducts = adminAccountingApi.bulkImportProducts as ReturnType<typeof vi.fn>;

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

async function addFilter(user: ReturnType<typeof userEvent.setup>, fieldValue: string, checkboxLabel: string) {
  await user.click(screen.getByRole('button', { name: 'Add filter' }));
  await user.selectOptions(screen.getByLabelText('Field'), fieldValue);
  await user.click(screen.getByLabelText(checkboxLabel));
  await user.click(screen.getByRole('button', { name: 'Apply →' }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProductsTab', () => {
  it('loads and renders products on mount', async () => {
    mockListProducts.mockResolvedValue({
      data: [makeProduct('p1')],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });

    render(<ProductsTab token="token-1" providerLabel="Xero" />);

    await waitFor(() => expect(screen.getByText('Product p1')).toBeInTheDocument());
    expect(mockListProducts).toHaveBeenCalledWith({ limit: 20, cursor: undefined }, 'token-1');
  });

  it('shows an error banner when the initial load fails', async () => {
    mockListProducts.mockRejectedValue(new Error('boom'));
    render(<ProductsTab token="token-1" providerLabel="Xero" />);
    await waitFor(() => expect(screen.getByText(/Failed to load products/)).toBeInTheDocument());
  });

  it('re-fetches with the selected status filter', async () => {
    mockListProducts.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, total: 0 } });
    const user = userEvent.setup();

    render(<ProductsTab token="token-1" providerLabel="Xero" />);
    await waitFor(() => expect(mockListProducts).toHaveBeenCalledTimes(1));

    await addFilter(user, 'status', 'Suggested match');

    await waitFor(() =>
      expect(mockListProducts).toHaveBeenLastCalledWith(
        { limit: 20, cursor: undefined, status: ['SUGGESTED'] },
        'token-1',
      ),
    );
  });

  it('re-fetches with the selected type filter, composing with the status filter', async () => {
    mockListProducts.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, total: 0 } });
    const user = userEvent.setup();

    render(<ProductsTab token="token-1" providerLabel="Xero" />);
    await waitFor(() => expect(mockListProducts).toHaveBeenCalledTimes(1));

    await addFilter(user, 'status', 'Suggested match');
    await waitFor(() => expect(mockListProducts).toHaveBeenCalledTimes(2));

    await addFilter(user, 'type', 'Tracked');

    await waitFor(() =>
      expect(mockListProducts).toHaveBeenLastCalledWith(
        { limit: 20, cursor: undefined, status: ['SUGGESTED'], type: ['tracked'] },
        'token-1',
      ),
    );
  });

  it('loads the next page and appends results on Load more', async () => {
    mockListProducts
      .mockResolvedValueOnce({
        data: [makeProduct('p1')],
        pagination: { nextCursor: 'cursor-2', hasMore: true, total: 2 },
      })
      .mockResolvedValueOnce({
        data: [makeProduct('p2')],
        pagination: { nextCursor: null, hasMore: false, total: 2 },
      });
    const user = userEvent.setup();

    render(<ProductsTab token="token-1" providerLabel="Xero" />);
    await waitFor(() => expect(screen.getByText('Product p1')).toBeInTheDocument());
    expect(screen.getByText('Load more')).toBeInTheDocument();

    await user.click(screen.getByText('Load more'));

    await waitFor(() => expect(screen.getByText('Product p2')).toBeInTheDocument());
    expect(screen.getByText('Product p1')).toBeInTheDocument();
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });

  it('selecting a row enables bulk import and queues an import with the selected ids', async () => {
    mockListProducts.mockResolvedValue({
      data: [makeProduct('p1')],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });
    mockBulkImportProducts.mockResolvedValue({ jobId: 'job-1' });
    const user = userEvent.setup();

    render(<ProductsTab token="token-1" providerLabel="Xero" />);
    await waitFor(() => expect(screen.getByText('Product p1')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Bulk import' })).toBeDisabled();

    await user.click(screen.getByLabelText('Select Product p1'));
    await user.click(screen.getByRole('button', { name: 'Bulk import (1)' }));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() =>
      expect(mockBulkImportProducts).toHaveBeenCalledWith({ ids: ['p1'], honourSuggestions: false }, 'token-1'),
    );
    await waitFor(() => expect(screen.getByText(/Import queued/)).toBeInTheDocument());
  });

  it('honours suggested matches when the checkbox is checked before importing', async () => {
    mockListProducts.mockResolvedValue({
      data: [makeProduct('p1')],
      pagination: { nextCursor: null, hasMore: false, total: 1 },
    });
    mockBulkImportProducts.mockResolvedValue({ jobId: 'job-1' });
    const user = userEvent.setup();

    render(<ProductsTab token="token-1" providerLabel="Xero" />);
    await waitFor(() => expect(screen.getByText('Product p1')).toBeInTheDocument());

    await user.click(screen.getByLabelText('Select Product p1'));
    await user.click(screen.getByRole('button', { name: 'Bulk import (1)' }));
    await user.click(screen.getByLabelText(/Honour suggested matches/));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() =>
      expect(mockBulkImportProducts).toHaveBeenCalledWith({ ids: ['p1'], honourSuggestions: true }, 'token-1'),
    );
  });
});
