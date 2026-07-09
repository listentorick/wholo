import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SyncNowButton } from './SyncNowButton';
import { adminAccountingApi } from '@wholo/admin-api-client';

vi.mock('@wholo/admin-api-client', () => ({
  adminAccountingApi: { syncContacts: vi.fn() },
}));

const mockSyncContacts = adminAccountingApi.syncContacts as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SyncNowButton', () => {
  it('queues a sync and shows confirmation copy, not an implication of instant completion', async () => {
    mockSyncContacts.mockResolvedValue({ queued: true });
    const user = userEvent.setup();

    render(<SyncNowButton token="token-1" />);
    await user.click(screen.getByText('Sync now'));

    expect(mockSyncContacts).toHaveBeenCalledWith('token-1');
    await waitFor(() => expect(screen.getByText(/Sync queued/)).toBeInTheDocument());
  });

  it('calls onQueued after a successful sync', async () => {
    mockSyncContacts.mockResolvedValue({ queued: true });
    const onQueued = vi.fn();
    const user = userEvent.setup();

    render(<SyncNowButton token="token-1" onQueued={onQueued} />);
    await user.click(screen.getByText('Sync now'));

    await waitFor(() => expect(onQueued).toHaveBeenCalled());
  });

  it('shows an error message when the request fails', async () => {
    mockSyncContacts.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();

    render(<SyncNowButton token="token-1" />);
    await user.click(screen.getByText('Sync now'));

    await waitFor(() => expect(screen.getByText(/Failed to queue a sync/)).toBeInTheDocument());
  });
});
