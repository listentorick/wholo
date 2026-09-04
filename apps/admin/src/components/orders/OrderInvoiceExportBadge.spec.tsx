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
  status: 'FAILED',
  externalInvoiceId: null,
  externalInvoiceNumber: null,
  externalInvoiceStatus: null,
  exportedAt: null,
  errorCode: 'PROVIDER_ERROR',
  errorMessage: null,
  createdAt: '2026-07-09T18:44:00.000Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OrderInvoiceExportBadge', () => {
  // Historical state (raised / in-progress) is shown by the order's audit-log
  // Timeline instead — this component renders nothing for non-FAILED status.
  it.each(['COMPLETED', 'PENDING', 'PROCESSING'] as const)('renders nothing when status is %s', (status) => {
    const { container } = render(<OrderInvoiceExportBadge invoiceExport={makeExport({ status })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the failure message with a retry action when the export failed', async () => {
    mockRetry.mockResolvedValue({ status: 'requested' });
    const user = userEvent.setup();

    render(
      <OrderInvoiceExportBadge
        invoiceExport={makeExport({
          errorMessage: 'Cannot create accounting invoice because the customer is not linked to an accounting contact.',
        })}

      />,
    );

    expect(screen.getByText(/customer is not linked/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry invoice export' }));

    expect(mockRetry).toHaveBeenCalledWith('export-1');
    await waitFor(() => expect(screen.getByText(/Retry requested/)).toBeInTheDocument());
  });

  it('shows an error when the retry request itself fails', async () => {
    mockRetry.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<OrderInvoiceExportBadge invoiceExport={makeExport()} />);
    await user.click(screen.getByRole('button', { name: 'Retry invoice export' }));

    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Retry invoice export' })).toBeInTheDocument();
  });
});
