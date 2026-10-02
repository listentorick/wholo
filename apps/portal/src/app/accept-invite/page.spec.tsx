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
const mockLogoutWithRedirect = vi.fn();
const mockRefreshSession = vi.fn();
let mockAccessToken: string | null = null;
let mockIdentityEmail: string | null = null;
let mockIsLoading = false;
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    accessToken: mockAccessToken,
    identityEmail: mockIdentityEmail,
    isLoading: mockIsLoading,
    loginWithRedirect: mockLoginWithRedirect,
    registerWithRedirect: mockRegisterWithRedirect,
    logoutWithRedirect: mockLogoutWithRedirect,
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
    mockIdentityEmail = null;
    mockIsLoading = false;
  });

  // The state a tab is in once Keycloak has answered "nobody is signed in".
  function sessionAlreadyChecked() {
    sessionStorage.setItem('wholo_invite_session_checked', 'tok-1');
  }

  it('shows an error when there is no invite token', async () => {
    mockSearchParamsToken = null;
    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByText(/Invalid invite link/)).toBeInTheDocument();
    });
  });

  it('silently asks Keycloak whether someone is already signed in before offering to create an account', async () => {
    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(mockLoginWithRedirect).toHaveBeenCalledTimes(1);
    });
    expect(mockLoginWithRedirect).toHaveBeenCalledWith(expect.stringContaining('/accept-invite?token=tok-1'), { prompt: 'none' });
    expect(screen.queryByText('Create account')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('wholo_pending_invite_token')).toBe('tok-1');
  });

  it('shows the landing screen, without redirecting again, once Keycloak has said nobody is signed in', async () => {
    sessionAlreadyChecked();
    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByText(/You've been invited to join Stocdup/)).toBeInTheDocument();
    });
    expect(mockLoginWithRedirect).not.toHaveBeenCalled();
    expect(mockRegisterWithRedirect).not.toHaveBeenCalled();
  });

  it('checks again for a different invitation opened in the same tab', async () => {
    sessionAlreadyChecked();
    mockSearchParamsToken = 'tok-2';
    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(mockLoginWithRedirect).toHaveBeenCalledWith(expect.stringContaining('token=tok-2'), { prompt: 'none' });
    });
  });

  it('stores the token and calls registerWithRedirect when "Create account" is clicked', async () => {
    sessionAlreadyChecked();
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

  it('names the signed-in account and offers to sign out when the invitation was sent to a different address', async () => {
    mockAccessToken = 'access-tok';
    mockIdentityEmail = 'james@vineandco.com';
    mockAccept.mockRejectedValue(new ApiError({ type: 'about:blank', title: 'Forbidden', status: 403, detail: 'This invitation was sent to a different email address' }, 403));

    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByText('This invitation was sent to a different email address')).toBeInTheDocument();
    });
    expect(screen.getByText('james@vineandco.com')).toBeInTheDocument();
    expect(screen.queryByText('Create account')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Sign out and continue'));

    expect(mockLogoutWithRedirect).toHaveBeenCalledWith(expect.stringContaining('/accept-invite?token=tok-1'));
    // The invitation must survive the sign-out round trip.
    expect(sessionStorage.getItem('wholo_pending_invite_token')).toBe('tok-1');
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
