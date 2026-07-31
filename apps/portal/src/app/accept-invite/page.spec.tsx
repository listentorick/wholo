import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AcceptInvitePage from './page';

const mockRouterReplace = vi.fn();
// Stable object references across renders — Next.js's real useRouter()/useSearchParams()
// are stable, and a fresh object per render would cause the page's effect (which lists
// them as deps) to refire on every state update, double-invoking accept()/refreshSession().
const mockRouter = { replace: mockRouterReplace };
let mockSearchParamsToken: string | null = 'tok-1';
const mockSearchParams = { get: (key: string) => (key === 'token' ? mockSearchParamsToken : null) };
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => mockRouter,
}));

const mockLoginWithRedirect = vi.fn();
const mockRegisterWithRedirect = vi.fn();
const mockRefreshSession = vi.fn();
let mockAccessToken: string | null = null;
let mockIsLoading = false;
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    accessToken: mockAccessToken,
    isLoading: mockIsLoading,
    loginWithRedirect: mockLoginWithRedirect,
    registerWithRedirect: mockRegisterWithRedirect,
    refreshSession: mockRefreshSession,
  }),
}));

const mockAccept = vi.fn();
vi.mock('@wholo/api-client', () => ({
  invitationsApi: { accept: (...args: unknown[]) => mockAccept(...args) },
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

import { ApiError } from '@wholo/api-client';

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockSearchParamsToken = 'tok-1';
    mockAccessToken = null;
    mockIsLoading = false;
  });

  it('shows an error when there is no invite token', async () => {
    mockSearchParamsToken = null;
    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByText(/Invalid invite link/)).toBeInTheDocument();
    });
  });

  it('shows the landing screen when not yet authenticated, without redirecting automatically', async () => {
    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByText(/You've been invited to join Stocdup/)).toBeInTheDocument();
    });
    expect(mockLoginWithRedirect).not.toHaveBeenCalled();
    expect(mockRegisterWithRedirect).not.toHaveBeenCalled();
  });

  it('stores the token and calls registerWithRedirect when "Create account" is clicked', async () => {
    render(<AcceptInvitePage />);
    await waitFor(() => screen.getByText('Create account'));

    fireEvent.click(screen.getByText('Create account'));

    expect(sessionStorage.getItem('wholo_pending_invite_token')).toBe('tok-1');
    expect(mockRegisterWithRedirect).toHaveBeenCalledWith(expect.stringContaining('token=tok-1'));
  });

  it('refreshes the session before navigating once the invite is accepted', async () => {
    mockAccessToken = 'access-tok';
    const callOrder: string[] = [];
    mockRefreshSession.mockImplementation(async () => {
      callOrder.push('refreshSession');
    });
    mockAccept.mockImplementation(async () => {
      callOrder.push('accept');
      return { distributorSlug: 'winos' };
    });

    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/winos');
    });

    expect(callOrder).toEqual(['accept', 'refreshSession']);
  });

  it('redirects to home on a 409 (already accepted)', async () => {
    mockAccessToken = 'access-tok';
    mockAccept.mockRejectedValue(new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, detail: 'Already accepted' }, 409));

    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/');
    });
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('shows an expired message on a 404/410', async () => {
    mockAccessToken = 'access-tok';
    mockAccept.mockRejectedValue(new ApiError({ type: 'about:blank', title: 'Gone', status: 410, detail: 'Expired' }, 410));

    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByText(/expired or is no longer valid/)).toBeInTheDocument();
    });
  });

  it('shows a generic error message for other failures', async () => {
    mockAccessToken = 'access-tok';
    mockAccept.mockRejectedValue(new Error('boom'));

    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });
});
