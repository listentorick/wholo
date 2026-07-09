import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SyncNowButton } from './SyncNowButton';
import { adminAccountingApi } from '@wholo/admin-api-client';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: {
    syncProducts: vi.fn(),
  },
}));

const mockSyncProducts = adminAccountingApi.syncProducts as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SyncNowButton (products)', () => {
  it('queues a product sync and shows confirmation copy', async () => {
    mockSyncProducts.mockResolvedValue({ queued: true });
    const user = userEvent.setup();

    render(<SyncNowButton token="token-1" />);
    await user.click(screen.getByText('Sync now'));

    expect(mockSyncProducts).toHaveBeenCalledWith('token-1');
    await waitFor(() => expect(screen.getByText(/Sync queued/)).toBeInTheDocument());
  });

  it('calls onQueued after a successful sync', async () => {
    mockSyncProducts.mockResolvedValue({ queued: true });
    const onQueued = vi.fn();
    const user = userEvent.setup();

    render(<SyncNowButton token="token-1" onQueued={onQueued} />);
    await user.click(screen.getByText('Sync now'));

    await waitFor(() => expect(onQueued).toHaveBeenCalled());
  });

  it('shows an error when queuing fails', async () => {
    mockSyncProducts.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<SyncNowButton token="token-1" />);
    await user.click(screen.getByText('Sync now'));

    await waitFor(() => expect(screen.getByText(/Failed to queue a sync/)).toBeInTheDocument());
  });
});
