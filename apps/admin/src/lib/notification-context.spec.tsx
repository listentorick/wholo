import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationProvider, useNotifications } from './notification-context';

const list = vi.fn();
const unreadCount = vi.fn();
const markRead = vi.fn();
const markAllRead = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({
  adminNotificationsApi: {
    list: (...a: unknown[]) => list(...a),
    unreadCount: (...a: unknown[]) => unreadCount(...a),
    markRead: (...a: unknown[]) => markRead(...a),
    markAllRead: (...a: unknown[]) => markAllRead(...a),
  },
}));

// Stable identity, as in the real auth context — a fresh `user` each render
// would re-run the poll effect and re-fetch the badge count.
const authState = { user: { id: 'u1' } };
vi.mock('./auth-context', () => ({ useAuth: () => authState }));

function notification(id: string) {
  return { id, title: `Title ${id}`, body: '', linkPath: null, readAt: null, createdAt: new Date().toISOString() };
}

function Probe() {
  const ctx = useNotifications();
  return (
    <div>
      <span data-testid="count">{ctx.unreadCount}</span>
      <span data-testid="ids">{ctx.recent.map((n) => n.id).join(',')}</span>
      <button onClick={() => ctx.fetchRecent()}>fetch</button>
      <button onClick={() => ctx.markRead('n1')}>read n1</button>
      <button onClick={() => ctx.markAllRead()}>read all</button>
    </div>
  );
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([notification('n1'), notification('n2')]);
  unreadCount.mockResolvedValue({ count: 2 });
  markRead.mockResolvedValue(undefined);
  markAllRead.mockResolvedValue(undefined);
});

async function renderFetched() {
  const user = userEvent.setup();
  render(<NotificationProvider><Probe /></NotificationProvider>);
  await flush();
  await user.click(screen.getByText('fetch'));
  await flush();
  expect(screen.getByTestId('count').textContent).toBe('2');
  return user;
}

describe('NotificationProvider', () => {
  it('fetches only unread notifications for the dropdown', async () => {
    await renderFetched();

    expect(list).toHaveBeenCalledWith({ unread: true });
    expect(screen.getByTestId('ids').textContent).toBe('n1,n2');
  });

  it('removes a notification from the list and decrements the badge once it is marked read', async () => {
    const user = await renderFetched();

    await user.click(screen.getByText('read n1'));

    expect(screen.getByTestId('ids').textContent).toBe('n2');
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(markRead).toHaveBeenCalledWith('n1');
  });

  it('empties the list and zeroes the badge on mark all read', async () => {
    const user = await renderFetched();

    await user.click(screen.getByText('read all'));

    expect(screen.getByTestId('ids').textContent).toBe('');
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(markAllRead).toHaveBeenCalled();
  });
});
