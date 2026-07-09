import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportProductDialog } from './ImportProductDialog';
import { adminAccountingApi, ApiError } from '@wholo/admin-api-client';
import type { AccountingProductSummary } from '@wholo/types';

vi.mock('@wholo/admin-api-client', async () => {
  const actual = await vi.importActual<typeof import('@wholo/admin-api-client')>('@wholo/admin-api-client');
  return { ...actual, adminAccountingApi: { importProduct: vi.fn() } };
});

const product: AccountingProductSummary = {
  id: 'ext-1',
  displayName: 'Cabernet Sauvignon 2023',
  description: 'A bold red',
  externalProductCode: 'CAB-SAUV-001',
  salesUnitPrice: '12.3456',
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImportProductDialog', () => {
  it('pre-fills name, SKU and the price rounded to 2 decimal places', () => {
    render(<ImportProductDialog product={product} token="token-1" onClose={() => {}} onImported={() => {}} />);
    expect(screen.getByLabelText('Product name')).toHaveValue('Cabernet Sauvignon 2023');
    expect(screen.getByLabelText('SKU')).toHaveValue('CAB-SAUV-001');
    expect(screen.getByLabelText('Price')).toHaveValue('12.35');
  });

  it('imports the product with the (possibly edited) fields and calls onImported', async () => {
    (adminAccountingApi.importProduct as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'prod-1' });
    const onImported = vi.fn();
    const user = userEvent.setup();

    render(<ImportProductDialog product={product} token="token-1" onClose={() => {}} onImported={onImported} />);
    await user.clear(screen.getByLabelText('Product name'));
    await user.type(screen.getByLabelText('Product name'), 'House Cab');
    await user.click(screen.getByText('Import product'));

    await waitFor(() =>
      expect(adminAccountingApi.importProduct).toHaveBeenCalledWith(
        'ext-1',
        { name: 'House Cab', sku: 'CAB-SAUV-001', price: '12.35' },
        'token-1',
      ),
    );
    await waitFor(() => expect(onImported).toHaveBeenCalled());
  });

  it('shows an error and re-enables the form when import fails', async () => {
    (adminAccountingApi.importProduct as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<ImportProductDialog product={product} token="token-1" onClose={() => {}} onImported={() => {}} />);
    await user.click(screen.getByText('Import product'));

    await waitFor(() => expect(screen.getByText(/Failed to import this product/)).toBeInTheDocument());
    expect(screen.getByText('Import product')).not.toBeDisabled();
  });

  it('shows a field-level error under SKU on a 409 conflict, not the generic banner', async () => {
    (adminAccountingApi.importProduct as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError(
        { type: 'about:blank', title: 'Conflict', status: 409, detail: 'A product with SKU CAB-SAUV-001 already exists — match the accounting product to it instead of importing' },
        409,
      ),
    );
    const user = userEvent.setup();

    render(<ImportProductDialog product={product} token="token-1" onClose={() => {}} onImported={() => {}} />);
    await user.click(screen.getByText('Import product'));

    await waitFor(() =>
      expect(screen.getByText(/A product with SKU CAB-SAUV-001 already exists/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Failed to import this product/)).not.toBeInTheDocument();
  });

  it('omits the price when the accounting product has none and the field is left empty', async () => {
    (adminAccountingApi.importProduct as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'prod-1' });
    const user = userEvent.setup();

    render(
      <ImportProductDialog
        product={{ ...product, salesUnitPrice: null }}
        token="token-1"
        onClose={() => {}}
        onImported={() => {}}
      />,
    );
    await user.click(screen.getByText('Import product'));

    await waitFor(() => expect(adminAccountingApi.importProduct).toHaveBeenCalled());
    const dto = (adminAccountingApi.importProduct as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(dto.price).toBeUndefined();
  });
});
