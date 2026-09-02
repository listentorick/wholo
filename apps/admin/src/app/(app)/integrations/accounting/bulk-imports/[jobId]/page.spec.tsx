import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BulkImportReportPage from './page';
import { adminAccountingApi } from '@wholo/admin-api-client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/integrations/accounting/bulk-imports/job-1',
  useParams: () => ({ jobId: 'job-1' }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

let searchParamsString = 'type=products';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: {
    getProductBulkImportJob: vi.fn(),
    getContactBulkImportJob: vi.fn(),
    countContactsNeedingAttention: vi.fn().mockResolvedValue({ count: 0 }),
  },
  // Sidebar (rendered by AdminLayout on every page) fetches this on mount.
  adminOrdersApi: {
    countOrdersNeedingAttention: vi.fn().mockResolvedValue({ count: 0 }),
  },
}));

const authState: Record<string, unknown> = {
  user: { id: 'user-1', firstName: 'Jane', lastName: 'Doe', organisationName: 'Blackbird Wines' },
  accessToken: 'token-1',
  isLoading: false,
  logoUrl: null,
};
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => authState,
}));

vi.mock('@/lib/notification-context', () => ({
  useNotifications: () => ({ unreadCount: 0, recent: [], fetchRecent: vi.fn(), markRead: vi.fn() }),
}));

const mockGetProductJob = adminAccountingApi.getProductBulkImportJob as ReturnType<typeof vi.fn>;
const mockGetContactJob = adminAccountingApi.getContactBulkImportJob as ReturnType<typeof vi.fn>;

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    distributorId: 'dist-1',
    recordType: 'PRODUCT',
    status: 'COMPLETED',
    honourSuggestions: false,
    totalCount: 3,
    importedCount: 2,
    matchedCount: 0,
    skippedCount: 0,
    failedCount: 1,
    results: [
      { externalId: 'ext-1', displayName: 'Widget A', outcome: 'imported' },
      { externalId: 'ext-2', displayName: 'Widget B', outcome: 'imported' },
      { externalId: 'ext-3', displayName: 'Widget C', outcome: 'failed', error: 'SKU collision' },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:01:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsString = 'type=products';
});

describe('BulkImportReportPage', () => {
  it('shows the summary counts and the failed/skipped table', async () => {
    mockGetProductJob.mockResolvedValue(makeJob());

    render(<BulkImportReportPage />);

    await waitFor(() => expect(screen.getByText('Widget C')).toBeInTheDocument());
    expect(mockGetProductJob).toHaveBeenCalledWith('job-1', 'token-1');
    expect(screen.getByText('2')).toBeInTheDocument(); // imported count
    expect(screen.getByText('SKU collision')).toBeInTheDocument();
    // Only failed/skipped rows are listed — successful imports aren't itemized
    expect(screen.queryByText('Widget A')).not.toBeInTheDocument();
  });

  it('fetches the contact job when type=contacts', async () => {
    searchParamsString = 'type=contacts';
    mockGetContactJob.mockResolvedValue(makeJob({ recordType: 'CONTACT' }));

    render(<BulkImportReportPage />);

    await waitFor(() => expect(mockGetContactJob).toHaveBeenCalledWith('job-1', 'token-1'));
    expect(mockGetProductJob).not.toHaveBeenCalled();
  });

  it('shows an in-progress banner while the job is still PROCESSING', async () => {
    mockGetProductJob.mockResolvedValue(makeJob({ status: 'PROCESSING', importedCount: 1, failedCount: 0 }));

    render(<BulkImportReportPage />);

    await waitFor(() => expect(screen.getByText(/still in progress/)).toBeInTheDocument());
  });

  it('shows a failure banner when the job status is FAILED', async () => {
    mockGetProductJob.mockResolvedValue(makeJob({ status: 'FAILED' }));

    render(<BulkImportReportPage />);

    await waitFor(() => expect(screen.getByText(/failed before completing/)).toBeInTheDocument());
  });

  it('shows an error state when the job fetch fails', async () => {
    mockGetProductJob.mockRejectedValue(new Error('boom'));

    render(<BulkImportReportPage />);

    await waitFor(() => expect(screen.getByText(/Failed to load the import report/)).toBeInTheDocument());
  });
});
