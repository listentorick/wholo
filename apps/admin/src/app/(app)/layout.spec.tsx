import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppLayout from './layout';

const authState: Record<string, unknown> = {};
vi.mock('@/lib/hooks/use-require-auth', () => ({ useRequireAuth: () => authState }));

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/lib/nav-badges-context', () => ({ useNavBadges: () => ({ counts: {} }) }));
vi.mock('@/lib/notification-context', () => ({
  useNotifications: () => ({
    unreadCount: 0,
    recent: [],
    isLoadingRecent: false,
    recentError: false,
    fetchRecent: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/orders',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

function setAuth(overrides: Record<string, unknown>) {
  for (const key of Object.keys(authState)) delete authState[key];
  Object.assign(authState, overrides);
}

beforeEach(() => setAuth({ user: null, isLoading: false }));

describe('AppLayout (authenticated shell)', () => {
  it('shows only a spinner while auth is still loading', () => {
    setAuth({ user: null, isLoading: true });
    const { container } = render(<AppLayout><div>page body</div></AppLayout>);

    expect(screen.queryByText('page body')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders nothing while useRequireAuth redirects an unauthenticated visitor', () => {
    setAuth({ user: null, isLoading: false });
    const { container } = render(<AppLayout><div>page body</div></AppLayout>);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the shell chrome once around the page body when authenticated', () => {
    setAuth({ user: { id: 'u1' }, isLoading: false });
    render(<AppLayout><div>page body</div></AppLayout>);

    expect(screen.getByText('page body')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });
});
