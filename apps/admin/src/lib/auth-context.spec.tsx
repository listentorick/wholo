import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@wholo/admin-api-client', () => ({
  adminAuthApi: { session: vi.fn() },
  adminAssetImagesApi: { list: vi.fn().mockResolvedValue([]) },
  ApiError: class ApiError extends Error {
    problem: { type: string; title: string; status: number; detail?: string };
    status: number;
    constructor(problem: { type: string; title: string; status: number; detail?: string }, status: number) {
      super(problem.detail ?? problem.title);
      this.name = 'ApiError';
      this.problem = problem;
      this.status = status;
    }
  },
}));

vi.mock('keycloak-js', () => ({
  default: vi.fn().mockImplementation(() => {
    const kc: any = {
      token: 'test-token',
      login: vi.fn(),
      logout: vi.fn(),
    };
    // onTokenExpired must be assigned by the caller before init() is invoked —
    // asserted here since a real Keycloak instance only arms its refresh timer
    // if the handler is already present when init() installs the initial token.
    kc.init = vi.fn().mockImplementation(() => {
      expect(kc.onTokenExpired).toBeInstanceOf(Function);
      return Promise.resolve(true);
    });
    return kc;
  }),
}));

import { adminAuthApi } from '@wholo/admin-api-client';

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (window as any).__kc;
  });

  it('sets user when the session check resolves ACTIVE', async () => {
    (adminAuthApi.session as any).mockResolvedValue({
      status: 'ACTIVE',
      user: { id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B', organisationId: 'org1' },
    });

    const { AuthProvider, useAuth } = await import('./auth-context');

    function StatusProbe() {
      const { user, isLoading } = useAuth();
      return <div data-testid="status">{isLoading ? 'loading' : user ? 'has-user' : 'no-user'}</div>;
    }

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('has-user');
    });
  });

  it('flags onboarding when the session check resolves ONBOARDING_REQUIRED', async () => {
    (adminAuthApi.session as any).mockResolvedValue({
      status: 'ONBOARDING_REQUIRED',
      identity: { email: 'a@b.com' },
    });

    const { AuthProvider, useAuth } = await import('./auth-context');

    function StatusProbe() {
      const { user, onboardingRequired, isLoading } = useAuth();
      return (
        <div data-testid="status">
          {isLoading ? 'loading' : onboardingRequired ? 'onboarding' : user ? 'has-user' : 'no-user'}
        </div>
      );
    }

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('onboarding');
    });
  });

  it('flags access-denied without setting user when the session check resolves ACCESS_DENIED', async () => {
    (adminAuthApi.session as any).mockResolvedValue({
      status: 'ACCESS_DENIED',
      user: {
        id: 'u1',
        email: 'buyer@b.com',
        firstName: 'Buyer',
        lastName: 'B',
        organisationId: 'org1',
        organisationType: 'TRADE_CUSTOMER',
      },
    });

    const { AuthProvider, useAuth } = await import('./auth-context');

    function StatusProbe() {
      const { user, accessDenied, identity, isLoading } = useAuth();
      return (
        <div data-testid="status">
          {isLoading ? 'loading' : accessDenied ? `denied:${identity?.email}:${user ? 'has-user' : 'no-user'}` : 'other'}
        </div>
      );
    }

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('denied:buyer@b.com:no-user');
    });
  });

  it('logout drives kc.logout() and does not clear auth state first', async () => {
    // Clearing `user` before navigating would re-render the shell, and
    // useRequireAuth would fire login() → kc.login(), whose /authorize redirect
    // supersedes the end-session redirect and re-authenticates via the still-live
    // SSO cookie. So logout must NOT touch React state on the happy path.
    (adminAuthApi.session as any).mockResolvedValue({
      status: 'ACTIVE',
      user: { id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B', organisationId: 'org1' },
    });

    const { AuthProvider, useAuth } = await import('./auth-context');

    function Probe() {
      const { user, isLoading, logout } = useAuth();
      return (
        <>
          <div data-testid="status">{isLoading ? 'loading' : user ? 'has-user' : 'no-user'}</div>
          <button onClick={logout}>logout</button>
        </>
      );
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('has-user');
    });

    fireEvent.click(screen.getByText('logout'));

    const kc = (window as any).__kc;
    expect(kc.logout).toHaveBeenCalledWith({ redirectUri: `${window.location.origin}/login` });
    // State untouched — the full-page navigation to Keycloak is what tears it down.
    expect(screen.getByTestId('status').textContent).toBe('has-user');
  });
});
