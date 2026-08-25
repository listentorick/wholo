import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopBar } from './TopBar';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const authState = {
  user: { firstName: 'Jane', lastName: 'Doe', organisationName: 'Blackbird Wines' },
  logoUrl: null,
};
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => authState,
}));

const notificationState: {
  unreadCount: number;
  recent: { id: string; title: string; body: string; linkPath: string | null; readAt: string | null; createdAt: string }[];
  isLoadingRecent: boolean;
  recentError: boolean;
  fetchRecent: ReturnType<typeof vi.fn>;
  markRead: ReturnType<typeof vi.fn>;
  markAllRead: ReturnType<typeof vi.fn>;
} = {
  unreadCount: 0,
  recent: [],
  isLoadingRecent: false,
  recentError: false,
  fetchRecent: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
};
vi.mock('@/lib/notification-context', () => ({
  useNotifications: () => notificationState,
}));

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { firstName: 'Jane', lastName: 'Doe', organisationName: 'Blackbird Wines' };
  notificationState.unreadCount = 0;
  notificationState.recent = [];
  notificationState.isLoadingRecent = false;
  notificationState.recentError = false;
});

describe('TopBar', () => {
  it('shows no badge when there are no unread notifications', () => {
    render(<TopBar onMenuClick={() => {}} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows the unread count badge', () => {
    notificationState.unreadCount = 3;
    render(<TopBar onMenuClick={() => {}} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('caps the badge at 9+', () => {
    notificationState.unreadCount = 42;
    render(<TopBar onMenuClick={() => {}} />);
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('fetches recent notifications and opens the dropdown on bell click', async () => {
    const user = userEvent.setup();
    render(<TopBar onMenuClick={() => {}} />);

    await user.click(screen.getByLabelText('Notifications'));

    expect(notificationState.fetchRecent).toHaveBeenCalled();
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
  });

  it('lists recent notifications with title and body', async () => {
    notificationState.recent = [
      { id: 'n1', title: 'Bulk import complete', body: '5 of 5 imported', linkPath: '/x', readAt: null, createdAt: new Date().toISOString() },
    ];
    const user = userEvent.setup();
    render(<TopBar onMenuClick={() => {}} />);

    await user.click(screen.getByLabelText('Notifications'));

    expect(screen.getByText('Bulk import complete')).toBeInTheDocument();
    expect(screen.getByText('5 of 5 imported')).toBeInTheDocument();
  });

  it('marks a notification read and navigates to its linkPath on click', async () => {
    notificationState.recent = [
      { id: 'n1', title: 'Bulk import complete', body: '5 of 5 imported', linkPath: '/integrations/accounting/bulk-imports/job-1', readAt: null, createdAt: new Date().toISOString() },
    ];
    const user = userEvent.setup();
    render(<TopBar onMenuClick={() => {}} />);

    await user.click(screen.getByLabelText('Notifications'));
    await user.click(screen.getByText('Bulk import complete'));

    expect(notificationState.markRead).toHaveBeenCalledWith('n1');
    expect(push).toHaveBeenCalledWith('/integrations/accounting/bulk-imports/job-1');
  });

  it('closes the dropdown on an outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <TopBar onMenuClick={() => {}} />
        <button>outside</button>
      </div>,
    );

    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();

    await user.click(screen.getByText('outside'));
    await waitFor(() => expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument());
  });

  it('closes the dropdown on Escape', async () => {
    const user = userEvent.setup();
    render(<TopBar onMenuClick={() => {}} />);

    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument());
  });

  it('toggles aria-expanded on the bell button and always exposes aria-haspopup', async () => {
    const user = userEvent.setup();
    render(<TopBar onMenuClick={() => {}} />);

    const bell = screen.getByLabelText('Notifications');
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    expect(bell).toHaveAttribute('aria-haspopup', 'true');

    await user.click(bell);
    expect(bell).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows a loading state instead of the empty state while fetching', async () => {
    notificationState.isLoadingRecent = true;
    const user = userEvent.setup();
    render(<TopBar onMenuClick={() => {}} />);

    await user.click(screen.getByLabelText('Notifications'));

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument();
  });

  it('shows an error state when the fetch failed', async () => {
    notificationState.recentError = true;
    const user = userEvent.setup();
    render(<TopBar onMenuClick={() => {}} />);

    await user.click(screen.getByLabelText('Notifications'));

    expect(screen.getByText("Couldn't load notifications")).toBeInTheDocument();
  });

  it('prefers the loading state over the error state when both are set', async () => {
    notificationState.isLoadingRecent = true;
    notificationState.recentError = true;
    const user = userEvent.setup();
    render(<TopBar onMenuClick={() => {}} />);

    await user.click(screen.getByLabelText('Notifications'));

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load notifications")).not.toBeInTheDocument();
  });

  it('marks all read without closing the dropdown or navigating', async () => {
    notificationState.recent = [
      { id: 'n1', title: 'Bulk import complete', body: '5 of 5 imported', linkPath: '/x', readAt: null, createdAt: new Date().toISOString() },
    ];
    const user = userEvent.setup();
    render(<TopBar onMenuClick={() => {}} />);

    await user.click(screen.getByLabelText('Notifications'));
    await user.click(screen.getByText('Mark all read'));

    expect(notificationState.markAllRead).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText('Bulk import complete')).toBeInTheDocument();
  });

  it('hides "Mark all read" when there are no notifications', async () => {
    const user = userEvent.setup();
    render(<TopBar onMenuClick={() => {}} />);

    await user.click(screen.getByLabelText('Notifications'));

    expect(screen.queryByText('Mark all read')).not.toBeInTheDocument();
  });

  it('truncates a long organisation name instead of wrapping it', () => {
    authState.user = {
      firstName: 'Jane',
      lastName: 'Doe',
      organisationName: 'A Very Long Wholesale Distribution Company Name That Would Otherwise Wrap',
    };
    render(<TopBar onMenuClick={() => {}} />);

    expect(screen.getByText(authState.user.organisationName)).toHaveClass('truncate');
  });
});
