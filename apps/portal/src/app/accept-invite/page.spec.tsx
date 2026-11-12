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
const mockLookup = vi.fn();
const mockSendCode = vi.fn();
vi.mock('@wholo/api-client', () => ({
  invitationsApi: {
    accept: (...args: unknown[]) => mockAccept(...args),
    lookup: (...args: unknown[]) => mockLookup(...args),
    sendCode: (...args: unknown[]) => mockSendCode(...args),
  },
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
import userEvent from '@testing-library/user-event';

const invitation = {
  invitedEmail: 'orders@rustyanchor.test',
  distributorName: 'Vine & Co',
  customerName: 'The Rusty Anchor',
  expiresAt: '2026-11-19T00:00:00.000Z',
};
const problem = (detail: string, status: number) => ({ type: 'about:blank', title: 'Error', status, detail });

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockSearchParamsToken = 'tok-1';
    mockAccessToken = null;
    mockIdentityEmail = null;
    mockIsLoading = false;
    mockLookup.mockResolvedValue(invitation);
    mockSendCode.mockResolvedValue({ sentTo: 'orders@rustyanchor.test', expiresInMinutes: 10 });
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

  it('shows the landing screen naming the distributor, business and invited address, without redirecting again', async () => {
    sessionAlreadyChecked();
    render(<AcceptInvitePage />);

    expect(await screen.findByRole('heading', { name: 'Order from Vine & Co on Stocdup' })).toBeInTheDocument();
    expect(screen.getByText('orders@rustyanchor.test')).toBeInTheDocument();
    expect(screen.getByText(/to order for The Rusty Anchor/)).toBeInTheDocument();
    expect(mockLookup).toHaveBeenCalledWith('tok-1');
    expect(mockLoginWithRedirect).not.toHaveBeenCalled();
    expect(mockRegisterWithRedirect).not.toHaveBeenCalled();
  });

  it('still offers the landing when the lookup fails for a passing reason, just without the details', async () => {
    sessionAlreadyChecked();
    mockLookup.mockRejectedValue(new Error('network'));
    render(<AcceptInvitePage />);

    expect(await screen.findByText(/You've been invited to join Stocdup/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Create account'));
    expect(mockRegisterWithRedirect).toHaveBeenCalledWith(expect.stringContaining('token=tok-1'), undefined);
  });

  it('keeps saying the link is no longer valid when the sign-in check finishes after the lookup', async () => {
    sessionAlreadyChecked();
    mockLookup.mockRejectedValue(new ApiError(problem('gone', 410), 410));
    mockIsLoading = true;
    const { rerender } = render(<AcceptInvitePage />);
    await waitFor(() => expect(mockLookup).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0)); // the lookup has answered

    mockIsLoading = false; // now the sign-in check decides "not signed in"
    rerender(<AcceptInvitePage />);

    expect(await screen.findByText(/expired or is no longer valid/)).toBeInTheDocument();
    expect(screen.queryByText('Create account')).not.toBeInTheDocument();
  });

  it.each([404, 410])('says the link is no longer valid when the lookup finds no open invitation (%s)', async (status) => {
    sessionAlreadyChecked();
    mockLookup.mockRejectedValue(new ApiError(problem('nope', status), status));
    render(<AcceptInvitePage />);

    expect(await screen.findByText(/expired or is no longer valid/)).toBeInTheDocument();
    expect(screen.queryByText('Create account')).not.toBeInTheDocument();
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
    expect(mockRegisterWithRedirect).toHaveBeenCalledWith(expect.stringContaining('token=tok-1'), { loginHint: 'orders@rustyanchor.test' });
  });

  it('fills the invited address in on Keycloak sign-in too', async () => {
    sessionAlreadyChecked();
    render(<AcceptInvitePage />);
    fireEvent.click(await screen.findByText('Sign in'));

    expect(mockLoginWithRedirect).toHaveBeenCalledWith(expect.stringContaining('token=tok-1'), { loginHint: 'orders@rustyanchor.test' });
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

  describe('signed in with another address', () => {
    beforeEach(() => {
      mockAccessToken = 'access-tok';
      mockIdentityEmail = 'rick@rustyanchor.test';
      mockAccept.mockRejectedValueOnce(new ApiError(problem('This invitation was sent to a different email address', 403), 403));
    });

    const openCodeStep = async () => {
      render(<AcceptInvitePage />);
      await screen.findByRole('heading', { name: 'Confirm you can use this invitation' });
    };

    it('offers a code sent to the invited address, naming both addresses, and keeps the invitation', async () => {
      await openCodeStep();

      expect(await screen.findAllByText('orders@rustyanchor.test')).not.toHaveLength(0);
      expect(screen.getByText('rick@rustyanchor.test')).toBeInTheDocument();
      expect(sessionStorage.getItem('wholo_pending_invite_token')).toBe('tok-1');
      expect(mockSendCode).not.toHaveBeenCalled(); // nothing is emailed until they ask
    });

    it('emails a code, then accepts with the code they type and opens the storefront', async () => {
      await openCodeStep();
      await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
      expect(mockSendCode).toHaveBeenCalledWith('tok-1');

      mockAccept.mockResolvedValueOnce({ distributorSlug: 'winos' });
      await userEvent.type(screen.getByLabelText('Code'), '123456');
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/winos'));
      expect(mockAccept).toHaveBeenLastCalledWith('tok-1', '123456');
      expect(mockRefreshSession).toHaveBeenCalled();
    });

    it('shows why a code was refused and lets them try again', async () => {
      await openCodeStep();
      await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
      mockAccept.mockRejectedValueOnce(new ApiError(problem('That code has expired. Send a new code.', 422), 422));
      await userEvent.type(screen.getByLabelText('Code'), '123456');
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('That code has expired. Send a new code.');
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
    });

    it('shows the wait message when a new code is asked for too soon', async () => {
      await openCodeStep();
      await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
      mockSendCode.mockRejectedValueOnce(new ApiError(problem('We sent a code less than a minute ago. Wait a moment, then send a new one.', 429), 429));
      await userEvent.click(screen.getByRole('button', { name: 'Send a new code' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('We sent a code less than a minute ago');
    });

    it('can still sign out and use the invited address instead, keeping the invitation', async () => {
      await openCodeStep();
      await userEvent.click(await screen.findByRole('button', { name: 'Sign out and use orders@rustyanchor.test instead' }));

      expect(mockLogoutWithRedirect).toHaveBeenCalledWith(expect.stringContaining('/accept-invite?token=tok-1'));
      expect(sessionStorage.getItem('wholo_pending_invite_token')).toBe('tok-1');
    });
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
