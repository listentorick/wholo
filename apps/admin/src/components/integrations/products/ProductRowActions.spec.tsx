import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductRowActions } from './ProductRowActions';
import { adminAccountingApi, adminProductsApi, ApiError } from '@wholo/admin-api-client';
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
  ApiError: class extends Error {
    constructor(
      public readonly problem: { type: string; title: string; status: number; detail?: string },
      public readonly status: number,
    ) {
      super(problem.detail ?? problem.title);
    }
  },
}));

function makeProduct(overrides: Partial<AccountingProductSummary> = {}): AccountingProductSummary {
  return {
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
    changeDetectedAt: null,
    changeAcknowledgedAt: null,
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
  (adminProductsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [],
    pagination: { nextCursor: null, hasMore: false, total: 0 },
  });
});

describe('ProductRowActions', () => {
  it('confirms a suggested match', async () => {
    (adminAccountingApi.confirmProductSuggestion as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const onActionComplete = vi.fn();
    const product = makeProduct({
      status: 'SUGGESTED',
      suggestion: {
        id: 'sugg-1',
        productId: 'prod-1',
        productName: 'Cab Sauv',
        confidence: 95,
        matchMethod: 'SKU_EXACT',
        matchReason: 'Item code matches the product SKU exactly',
      },
    });
    const user = userEvent.setup();

    render(<ProductRowActions product={product} token="token-1" providerLabel="Xero" onActionComplete={onActionComplete} />);
    await user.click(screen.getByText('Confirm match'));

    await waitFor(() =>
      expect(adminAccountingApi.confirmProductSuggestion).toHaveBeenCalledWith('sugg-1', 'token-1', {
        confirmTaxTypeOverride: false,
      }),
    );
    await waitFor(() => expect(onActionComplete).toHaveBeenCalled());
  });

  it('shows a conflict modal on a TAX_TYPE_CONFLICT 409 when confirming a match, then resubmits with confirmTaxTypeOverride on confirm', async () => {
    const conflictDetail = 'This accounting product\'s tax type (VAT) differs from the existing product\'s tax type (Zero-rated). Confirm to overwrite.';
    (adminAccountingApi.confirmProductSuggestion as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(
        new ApiError({ type: 'about:blank', title: 'TAX_TYPE_CONFLICT', status: 409, detail: conflictDetail }, 409),
      )
      .mockResolvedValueOnce(undefined);
    const onActionComplete = vi.fn();
    const product = makeProduct({
      status: 'SUGGESTED',
      suggestion: {
        id: 'sugg-1',
        productId: 'prod-1',
        productName: 'Cab Sauv',
        confidence: 95,
        matchMethod: 'SKU_EXACT',
        matchReason: 'Item code matches the product SKU exactly',
      },
    });
    const user = userEvent.setup();

    render(<ProductRowActions product={product} token="token-1" providerLabel="Xero" onActionComplete={onActionComplete} />);
    await user.click(screen.getByText('Confirm match'));

    await waitFor(() => expect(screen.getByText(conflictDetail)).toBeInTheDocument());

    await user.click(screen.getByText('Confirm & overwrite'));

    await waitFor(() =>
      expect(adminAccountingApi.confirmProductSuggestion).toHaveBeenLastCalledWith('sugg-1', 'token-1', {
        confirmTaxTypeOverride: true,
      }),
    );
    await waitFor(() => expect(onActionComplete).toHaveBeenCalled());
  });

  it('ignores a product', async () => {
    (adminAccountingApi.ignoreProduct as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const onActionComplete = vi.fn();
    const user = userEvent.setup();

    render(<ProductRowActions product={makeProduct()} token="token-1" providerLabel="Xero" onActionComplete={onActionComplete} />);
    await user.click(screen.getByText('Ignore'));

    await waitFor(() => expect(adminAccountingApi.ignoreProduct).toHaveBeenCalledWith('ext-1', 'token-1'));
    await waitFor(() => expect(onActionComplete).toHaveBeenCalled());
  });

  it('opens the import dialog for a ready-to-import product', async () => {
    const user = userEvent.setup();
    render(<ProductRowActions product={makeProduct()} token="token-1" providerLabel="Xero" onActionComplete={() => {}} />);

    await user.click(screen.getByText('Import as new'));

    expect(screen.getByText('Import as new product')).toBeInTheDocument();
  });

  it('opens the match dialog for a ready-to-import product', async () => {
    const user = userEvent.setup();
    render(<ProductRowActions product={makeProduct()} token="token-1" providerLabel="Xero" onActionComplete={() => {}} />);

    await user.click(screen.getByText('Match to existing'));

    expect(screen.getByText('Match to existing product')).toBeInTheDocument();
  });

  it('shows a View product link and Unlink button for a linked product', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (adminAccountingApi.unlinkProductMapping as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const onActionComplete = vi.fn();
    const product = makeProduct({
      status: 'LINKED',
      mapping: {
        id: 'mapping-1',
        productId: 'prod-1',
        productName: 'Cab Sauv',
        matchMethod: 'MANUAL',
        linkedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const user = userEvent.setup();

    render(<ProductRowActions product={product} token="token-1" providerLabel="Xero" onActionComplete={onActionComplete} />);
    expect(screen.getByText('View product').closest('a')).toHaveAttribute('href', '/products/prod-1/edit');

    await user.click(screen.getByText('Unlink'));

    await waitFor(() => expect(adminAccountingApi.unlinkProductMapping).toHaveBeenCalledWith('mapping-1', 'token-1'));
    await waitFor(() => expect(onActionComplete).toHaveBeenCalled());
  });

  it('shows no actions for an inactive product', () => {
    render(<ProductRowActions product={makeProduct({ status: 'INACTIVE' })} token="token-1" providerLabel="Xero" onActionComplete={() => {}} />);
    expect(screen.getByText('No longer in Xero')).toBeInTheDocument();
    expect(screen.queryByText('Import as new')).not.toBeInTheDocument();
  });

  it('shows a label only for a purchase-only product', () => {
    render(<ProductRowActions product={makeProduct({ status: 'NOT_SOLD' })} token="token-1" providerLabel="Xero" onActionComplete={() => {}} />);
    expect(screen.getByText('Purchase-only in Xero')).toBeInTheDocument();
    expect(screen.queryByText('Import as new')).not.toBeInTheDocument();
  });

  it('shows an error message when an action fails', async () => {
    (adminAccountingApi.ignoreProduct as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<ProductRowActions product={makeProduct()} token="token-1" providerLabel="Xero" onActionComplete={() => {}} />);
    await user.click(screen.getByText('Ignore'));

    await waitFor(() => expect(screen.getByText('That action failed. Please try again.')).toBeInTheDocument());
  });
});
