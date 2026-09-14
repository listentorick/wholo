import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@wholo/api-client', () => ({
  authApi: { me: vi.fn() },
  orderAsApi: { end: vi.fn() },
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

import { authApi, orderAsApi, ApiError, setTokenProvider } from '@wholo/api-client';

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

describe('AuthProvider — order-as session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    (authApi.me as any).mockResolvedValue({ id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B' });
  });

  function ProbeButtons({ ctx }: { ctx: ReturnType<AuthContextModule['useAuth']> }) {
    return (
      <>
        <div data-testid="mode">{ctx.orderAsMode ? 'on' : 'off'}</div>
        <button onClick={() => ctx.setOrderAsSession({
          sessionToken: 'sess-1', customerId: 'cust-1', customerName: 'The Roebuck Inn', distributorId: 'dist-1', distributorSlug: 'winos',
        })}>start</button>
        <button onClick={() => ctx.endOrderAsSession()}>end</button>
      </>
    );
  }

  it('setOrderAsSession stores the session token in sessionStorage and flips orderAsMode on', async () => {
    const mod = await loadContext();
    renderWithProbe(mod, (ctx) => <ProbeButtons ctx={ctx} />);

    fireEvent.click(screen.getByText('start'));

    expect(screen.getByTestId('mode').textContent).toBe('on');
    expect(sessionStorage.getItem('orderAs_session')).toBe('sess-1');
  });

  it('endOrderAsSession clears local state even when the best-effort server call rejects', async () => {
    (orderAsApi.end as any).mockRejectedValue(new Error('network error'));
    const mod = await loadContext();
    renderWithProbe(mod, (ctx) => <ProbeButtons ctx={ctx} />);

    fireEvent.click(screen.getByText('start'));
    expect(screen.getByTestId('mode').textContent).toBe('on');

    await act(async () => {
      fireEvent.click(screen.getByText('end'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(orderAsApi.end).toHaveBeenCalledWith('sess-1');
    expect(sessionStorage.getItem('orderAs_session')).toBeNull();
    expect(screen.getByTestId('mode').textContent).toBe('off');
  });

  it('endOrderAsSession redirects using orderAsState.distributorSlug, not the current pathname', async () => {
    const originalLocation = window.location;
    const hrefSetter = vi.fn();
    // jsdom's real Location doesn't implement full navigation (and its `href`
    // property isn't spy-configurable) — swap in a plain object so we can
    // observe exactly what URL endOrderAsSession tries to navigate to.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        pathname: '/', // not a distributor route — proves the slug isn't read from here
        set href(url: string) { hrefSetter(url); },
      },
    });

    (orderAsApi.end as any).mockResolvedValue(undefined);

    const mod = await loadContext();
    renderWithProbe(mod, (ctx) => <ProbeButtons ctx={ctx} />);

    fireEvent.click(screen.getByText('start'));

    await act(async () => {
      fireEvent.click(screen.getByText('end'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hrefSetter).toHaveBeenCalledWith('/winos/order-as-ended?customer=The%20Roebuck%20Inn');

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });
});
