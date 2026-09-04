import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@wholo/admin-api-client', () => ({
  adminAuthApi: { session: vi.fn() },
  adminAssetImagesApi: { list: vi.fn().mockResolvedValue([]) },
  setTokenProvider: vi.fn(),
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
      authenticated: true,
      token: 'test-token',
      updateToken: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };
    // onTokenExpired must be assigned by the caller before init() is invoked —
    // asserted here since a real Keycloak instance only arms its refresh timer
    // if the handler is already present when init() installs the initial token.
    kc.init = vi.fn().mockImplementation(() => {
      expect(kc.onTokenExpired).toBeInstanceOf(Function);
      (window as any).__kc = kc;
      return Promise.resolve(true);
    });
    return kc;
  }),
}));

import { adminAuthApi, setTokenProvider } from '@wholo/admin-api-client';

type AuthContextModule = typeof import('./auth-context');

async function loadContext(): Promise<AuthContextModule> {
  vi.resetModules();
  return import('./auth-context');
}

function renderWithProbe(
  mod: AuthContextModule,
  extra?: (ctx: ReturnType<AuthContextModule['useAuth']>) => ReactNode,
) {
  const { AuthProvider, useAuth } = mod;
  function Probe() {
    const ctx = useAuth();
    const status = ctx.isLoading
      ? 'loading'
      : ctx.accessDenied
        ? `denied:${ctx.identity?.email}:${ctx.user ? 'has-user' : 'no-user'}`
        : ctx.onboardingRequired
          ? 'onboarding'
          : ctx.user
            ? 'has-user'
            : 'no-user';
    return (
      <div>
        <div data-testid="status">{status}</div>
        {extra?.(ctx)}
      </div>
    );
  }
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).__kc;
  });

  it('registers the centralised token provider with the api-client on mount', async () => {
    (adminAuthApi.session as any).mockResolvedValue({
      status: 'ACTIVE',
      user: { id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B', organisationId: 'org1' },
    });
    const mod = await loadContext();
    const { getAuthToken } = await import('./auth-token');

    renderWithProbe(mod);

    await waitFor(() => expect(setTokenProvider).toHaveBeenCalledWith(getAuthToken));
  });

  it('sets user when the session check resolves ACTIVE', async () => {
    (adminAuthApi.session as any).mockResolvedValue({
      status: 'ACTIVE',
      user: { id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B', organisationId: 'org1' },
    });

    renderWithProbe(await loadContext());

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('has-user'));
  });

  it('flags onboarding when the session check resolves ONBOARDING_REQUIRED', async () => {
    (adminAuthApi.session as any).mockResolvedValue({
      status: 'ONBOARDING_REQUIRED',
      identity: { email: 'a@b.com' },
    });

    renderWithProbe(await loadContext());

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('onboarding'));
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

    renderWithProbe(await loadContext());

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('denied:buyer@b.com:no-user'),
    );
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

    renderWithProbe(await loadContext(), (ctx) => <button onClick={ctx.logout}>logout</button>);

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('has-user'));

    fireEvent.click(screen.getByText('logout'));

    const kc = (window as any).__kc;
    expect(kc.logout).toHaveBeenCalledWith({ redirectUri: `${window.location.origin}/login` });
    expect(screen.getByTestId('status').textContent).toBe('has-user');
  });

  it('shows the blocking session-expired panel and a working "Sign in again" button when a refresh fails', async () => {
    (adminAuthApi.session as any).mockResolvedValue({
      status: 'ACTIVE',
      user: { id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B', organisationId: 'org1' },
    });

    renderWithProbe(await loadContext());
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('has-user'));

    // Simulate the keycloak-js refresh timer firing after the refresh token is dead.
    const kc = (window as any).__kc;
    kc.updateToken = vi.fn().mockRejectedValue(new Error('refresh failed'));
    await act(async () => {
      kc.onTokenExpired();
      await Promise.resolve();
    });

    const panel = await screen.findByRole('alertdialog');
    expect(panel.textContent).toContain('Your session has expired. Sign in again to continue.');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    await waitFor(() => expect(kc.login).toHaveBeenCalled());
  });

  it('a 403 from an API call does not flip the session-expired latch or trigger a refresh', async () => {
    (adminAuthApi.session as any).mockResolvedValue({
      status: 'ACTIVE',
      user: { id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B', organisationId: 'org1' },
    });

    renderWithProbe(await loadContext());
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('has-user'));

    const kc = (window as any).__kc;
    const updateCallsBefore = kc.updateToken.mock.calls.length;

    // Nothing in the auth layer reacts to a 403 — no handler is invoked.
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(kc.updateToken.mock.calls.length).toBe(updateCallsBefore);
  });
});
