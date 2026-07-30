import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@wholo/api-client', () => ({
  authApi: { me: vi.fn() },
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
  default: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(true),
    token: 'test-token',
    login: vi.fn(),
    logout: vi.fn(),
  })),
}));

import { authApi, ApiError } from '@wholo/api-client';

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (window as any).__kc;
  });

  it('captures the ApiError detail into authError and leaves user null when Wholo rejects the identity', async () => {
    (authApi.me as any).mockRejectedValue(
      new ApiError(
        { type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'No Wholo user found for this identity' },
        401,
      ),
    );

    const { AuthProvider, useAuth } = await import('./auth-context');

    function StatusProbe() {
      const { user, authError, isLoading } = useAuth();
      return <div data-testid="status">{isLoading ? 'loading' : authError ?? (user ? 'has-user' : 'no-user')}</div>;
    }

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('No Wholo user found for this identity');
    });
  });

  it('sets user and leaves authError null when authApi.me resolves', async () => {
    (authApi.me as any).mockResolvedValue({ id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B' });

    const { AuthProvider, useAuth } = await import('./auth-context');

    function StatusProbe() {
      const { user, authError, isLoading } = useAuth();
      return <div data-testid="status">{isLoading ? 'loading' : authError ?? (user ? 'has-user' : 'no-user')}</div>;
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
});
