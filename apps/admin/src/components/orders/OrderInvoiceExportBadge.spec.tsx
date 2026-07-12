import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderInvoiceExportBadge } from './OrderInvoiceExportBadge';
import { adminAccountingApi } from '@wholo/admin-api-client';
import type { OrderInvoiceExportSummary } from '@wholo/types';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: { retryInvoiceExport: vi.fn() },
}));

const mockRetry = adminAccountingApi.retryInvoiceExport as ReturnType<typeof vi.fn>;

const makeExport = (overrides: Partial<OrderInvoiceExportSummary> = {}): OrderInvoiceExportSummary => ({
  id: 'export-1',
  provider: 'XERO',
  status: 'COMPLETED',
  externalInvoiceId: 'inv-1',
  externalInvoiceNumber: 'INV-0042',
  externalInvoiceStatus: 'DRAFT',
  exportedAt: '2026-07-09T18:45:00.000Z',
  errorCode: null,
  errorMessage: null,
  createdAt: '2026-07-09T18:44:00.000Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OrderInvoiceExportBadge', () => {
  it('shows the raised invoice number and provider when the export completed', () => {
    render(<OrderInvoiceExportBadge invoiceExport={makeExport()} token="token-1" />);

    expect(screen.getByText('Invoice raised')).toBeInTheDocument();
    expect(screen.getByText(/INV-0042/)).toBeInTheDocument();
    expect(screen.getByText(/Xero/)).toBeInTheDocument();
  });

  it('tolerates a missing invoice number (providers that number on approval)', () => {
    render(
      <OrderInvoiceExportBadge
        invoiceExport={makeExport({ externalInvoiceNumber: null, externalInvoiceStatus: null })}
        token="token-1"
      />,
    );

    expect(screen.getByText('Invoice raised')).toBeInTheDocument();
    expect(screen.getByText(/An invoice/)).toBeInTheDocument();
  });

  it('shows the failure message with a retry action when the export failed', async () => {
    mockRetry.mockResolvedValue({ status: 'requested' });
    const user = userEvent.setup();

    render(
      <OrderInvoiceExportBadge
        invoiceExport={makeExport({
          status: 'FAILED',
          errorMessage: 'Cannot create accounting invoice because the customer is not linked to an accounting contact.',
        })}
        token="token-1"
      />,
    );

    expect(screen.getByText(/customer is not linked/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry invoice export' }));

    expect(mockRetry).toHaveBeenCalledWith('export-1', 'token-1');
    await waitFor(() => expect(screen.getByText(/Retry requested/)).toBeInTheDocument());
  });

  it('shows an error when the retry request itself fails', async () => {
    mockRetry.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<OrderInvoiceExportBadge invoiceExport={makeExport({ status: 'FAILED' })} token="token-1" />);
    await user.click(screen.getByRole('button', { name: 'Retry invoice export' }));

    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Retry invoice export' })).toBeInTheDocument();
  });

  it('shows an in-progress state for pending and processing exports', () => {
    render(<OrderInvoiceExportBadge invoiceExport={makeExport({ status: 'PROCESSING' })} token="token-1" />);

    expect(screen.getByText('Invoice export in progress')).toBeInTheDocument();
  });
});
