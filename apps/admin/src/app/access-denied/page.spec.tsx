import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccessDeniedPage from './page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const authState: Record<string, unknown> = {};
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => authState,
}));

function setAuth(overrides: Record<string, unknown>) {
  for (const key of Object.keys(authState)) delete authState[key];
  Object.assign(
    authState,
    {
      user: null,
      isLoading: false,
      accessDenied: true,
      identity: { email: 'buyer@acme.com', firstName: 'Buyer', lastName: 'Acme' },
      logout: vi.fn(),
    },
    overrides,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuth({});
});

describe('AccessDeniedPage', () => {
  it('explains the boundary and shows which account is signed in', () => {
    render(<AccessDeniedPage />);

    expect(screen.getByText('This is the distributor workspace')).toBeInTheDocument();
    expect(screen.getByText(/trade customer, not a distributor/i)).toBeInTheDocument();
    expect(screen.getByText('buyer@acme.com')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('signs out when the button is clicked', async () => {
    const user = userEvent.setup();
    render(<AccessDeniedPage />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(authState.logout).toHaveBeenCalled();
  });

  it('redirects to the dashboard if landed on directly while actually authorized', () => {
    setAuth({ accessDenied: false, user: { id: 'u1' } });
    render(<AccessDeniedPage />);

    expect(replace).toHaveBeenCalledWith('/');
  });

  it('redirects to login if landed on directly with no session at all', () => {
    setAuth({ accessDenied: false, user: null });
    render(<AccessDeniedPage />);

    expect(replace).toHaveBeenCalledWith('/login');
  });
});
