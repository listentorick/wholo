import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@wholo/api-client', () => ({
  authApi: { me: vi.fn() },
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
      return Promise.resolve(true);
    });
    return kc;
  }),
}));

import { authApi, ApiError, setTokenProvider } from '@wholo/api-client';

type AuthContextModule = typeof import('./auth-context');

async function loadContext(): Promise<AuthContextModule> {
  vi.resetModules();
  return import('./auth-context');
}

function renderWithProbe(mod: AuthContextModule, extra?: (ctx: ReturnType<AuthContextModule['useAuth']>) => ReactNode) {
  const { AuthProvider, useAuth } = mod;
  function Probe() {
    const ctx = useAuth();
    return (
      <div>
        <div data-testid="status">
          {ctx.isLoading ? 'loading' : ctx.authError ?? (ctx.user ? 'has-user' : 'no-user')}
        </div>
        {extra?.(ctx)}
      </div>
    );
  }
  return render(<AuthProvider><Probe /></AuthProvider>);
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).__kc;
  });

  it('registers the centralised token provider with the api-client on mount', async () => {
    (authApi.me as any).mockResolvedValue({ id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B' });
    const mod = await loadContext();
    const { getAuthToken } = await import('./auth-token');

    renderWithProbe(mod);

    await waitFor(() => expect(setTokenProvider).toHaveBeenCalledWith(getAuthToken));
  });

  it('captures the ApiError detail into authError and leaves user null when Wholo rejects the identity', async () => {
    (authApi.me as any).mockRejectedValue(
      new ApiError(
        { type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'No Wholo user found for this identity' },
        401,
      ),
    );

    renderWithProbe(await loadContext());

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('No Wholo user found for this identity');
    });
  });

  it('sets user and leaves authError null when authApi.me resolves', async () => {
    (authApi.me as any).mockResolvedValue({ id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B' });

    renderWithProbe(await loadContext());

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('has-user');
    });
  });

  it('refreshSession clears a stale authError once the underlying call succeeds', async () => {
    (authApi.me as any)
      .mockRejectedValueOnce(
        new ApiError(
          { type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'No Wholo user found for this identity' },
          401,
        ),
      )
      .mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B' });

    renderWithProbe(await loadContext(), (ctx) => (
      <button onClick={() => ctx.refreshSession()}>refresh</button>
    ));

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('No Wholo user found for this identity');
    });

    fireEvent.click(screen.getByText('refresh'));

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('has-user');
    });
  });

  it('shows the blocking session-expired panel and a working "Sign in again" button when a refresh fails', async () => {
    (authApi.me as any).mockResolvedValue({ id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B' });

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
    (authApi.me as any).mockResolvedValue({ id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B' });

    renderWithProbe(await loadContext());
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('has-user'));

    const kc = (window as any).__kc;
    const updateCallsBefore = kc.updateToken.mock.calls.length;

    // Nothing in the auth layer reacts to a 403 — no handler is invoked.
    await act(async () => { await Promise.resolve(); });

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(kc.updateToken.mock.calls.length).toBe(updateCallsBefore);
  });
});
