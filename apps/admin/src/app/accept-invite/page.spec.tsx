import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@wholo/admin-api-client';
import { Role } from '@wholo/types';
import AcceptInvitePage from './page';

const replace = vi.fn();
const search = { token: 'emailed-token' as string | null };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => ({ get: (k: string) => (k === 'token' ? search.token : null) }),
}));

const login = vi.fn();
const register = vi.fn();
const logoutWithRedirect = vi.fn();
const refreshSession = vi.fn();
const auth: {
  accessToken: string | null;
  isLoading: boolean;
  identity: { email: string } | null;
  identityEmail: string | null;
} = { accessToken: null, isLoading: false, identity: null, identityEmail: null };
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ ...auth, login, register, logoutWithRedirect, refreshSession }),
}));

const accept = vi.fn();
const lookup = vi.fn();
const sendCode = vi.fn();
vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return {
    ...actual,
    adminTeamApi: {
      acceptInvitation: (...a: unknown[]) => accept(...a),
      lookupInvitation: (...a: unknown[]) => lookup(...a),
      sendInvitationCode: (...a: unknown[]) => sendCode(...a),
    },
  };
});

const invitation = { invitedEmail: 'sam@vine.test', distributorName: 'Vine & Co', inviterName: 'James Vine', expiresAt: '2026-11-19T00:00:00.000Z' };

const problem = (detail: string, status: number) => ({ type: 'about:blank', title: 'Error', status, detail });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  search.token = 'emailed-token';
  auth.accessToken = null;
  auth.isLoading = false;
  auth.identity = null;
  auth.identityEmail = null;
  refreshSession.mockResolvedValue(undefined);
  lookup.mockResolvedValue(invitation);
  sendCode.mockResolvedValue({ sentTo: 'sam@vine.test', expiresInMinutes: 10 });
});

// The state a tab is in once Keycloak has answered "nobody is signed in".
const sessionAlreadyChecked = () => sessionStorage.setItem('stocdup_staff_invite_session_checked', 'emailed-token');

describe('Accept invitation — checking for an existing sign-in first', () => {
  it('silently asks Keycloak whether anyone is signed in before offering to create an account', () => {
    render(<AcceptInvitePage />);

    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith('/accept-invite?token=emailed-token', { prompt: 'none' });
    expect(screen.queryByRole('button', { name: 'Create your account' })).not.toBeInTheDocument();
  });

  it('asks only once, even when React runs the effect twice', () => {
    render(<StrictMode><AcceptInvitePage /></StrictMode>);

    expect(login).toHaveBeenCalledTimes(1);
  });

  it('asks again for a different invitation opened in the same tab', () => {
    sessionAlreadyChecked();
    search.token = 'another-token';
    render(<AcceptInvitePage />);

    expect(login).toHaveBeenCalledWith('/accept-invite?token=another-token', { prompt: 'none' });
  });
});

describe('Accept invitation — not signed in', () => {
  beforeEach(sessionAlreadyChecked);

  it('names the company, who invited them and the invited address', async () => {
    render(<AcceptInvitePage />);

    expect(await screen.findByRole('heading', { name: 'Join Vine & Co on Stocdup' })).toBeInTheDocument();
    expect(screen.getByText('sam@vine.test')).toBeInTheDocument();
    expect(screen.getByText(/James Vine invited/)).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith('emailed-token');
    expect(accept).not.toHaveBeenCalled();
  });

  it('sends Create your account to Keycloak sign-up with the invited address filled in, coming back to this invitation', async () => {
    render(<AcceptInvitePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Create your account' }));
    expect(register).toHaveBeenCalledWith('/accept-invite?token=emailed-token', { loginHint: 'sam@vine.test' });
  });

  it('sends "I already have an account" to Keycloak sign-in with the invited address filled in', async () => {
    render(<AcceptInvitePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'I already have an account' }));
    expect(login).toHaveBeenCalledWith('/accept-invite?token=emailed-token', { loginHint: 'sam@vine.test' });
  });

  it('keeps saying the invitation is gone when the sign-in check finishes after the lookup', async () => {
    lookup.mockRejectedValue(new ApiError(problem('gone', 410), 410));
    auth.isLoading = true;
    const { rerender } = render(<AcceptInvitePage />);
    await waitFor(() => expect(lookup).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0)); // the lookup has answered

    auth.isLoading = false; // now the sign-in check decides "not signed in"
    rerender(<AcceptInvitePage />);

    expect(await screen.findByRole('heading', { name: 'This invitation is no longer valid' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create your account' })).not.toBeInTheDocument();
  });

  it('still offers both when the lookup fails for a passing reason, just without the details', async () => {
    lookup.mockRejectedValue(new Error('network'));
    render(<AcceptInvitePage />);

    expect(await screen.findByRole('heading', { name: /invited to join a team on Stocdup/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create your account' }));
    expect(register).toHaveBeenCalledWith('/accept-invite?token=emailed-token', undefined);
  });

  it.each([404, 410])('says the invitation is no longer valid when the lookup finds no open invitation (%s)', async (status) => {
    lookup.mockRejectedValue(new ApiError(problem('nope', status), status));
    render(<AcceptInvitePage />);

    expect(await screen.findByRole('heading', { name: 'This invitation is no longer valid' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create your account' })).not.toBeInTheDocument();
  });

  it('remembers the token for the trip through Keycloak, so onboarding can defer to it', () => {
    render(<AcceptInvitePage />);
    expect(sessionStorage.getItem('stocdup_pending_staff_invite')).toBe('emailed-token');
  });

  it('shows the invalid-link page when there is no token at all', () => {
    search.token = null;
    render(<AcceptInvitePage />);
    expect(screen.getByRole('heading', { name: 'This invitation is no longer valid' })).toBeInTheDocument();
  });
});

describe('Accept invitation — signed in', () => {
  beforeEach(() => {
    auth.accessToken = 'kc-token';
    auth.identity = { email: 'sam@vine.test' };
  });

  it('accepts, then welcomes them to the company with the roles they now have', async () => {
    accept.mockResolvedValue({ distributorId: 'd1', distributorName: 'Vine & Co', roles: [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF] });
    render(<AcceptInvitePage />);

    expect(await screen.findByRole('heading', { name: /Welcome to Vine & Co/ })).toBeInTheDocument();
    expect(screen.getByText('Operations manager')).toBeInTheDocument();
    expect(screen.getByText('Warehouse staff')).toBeInTheDocument();
    expect(accept).toHaveBeenCalledWith('emailed-token');
    expect(refreshSession).toHaveBeenCalled(); // so the app opens as them
    expect(sessionStorage.getItem('stocdup_pending_staff_invite')).toBeNull();
  });

  it('opens Stocdup from the welcome page', async () => {
    accept.mockResolvedValue({ distributorId: 'd1', distributorName: 'Vine & Co', roles: [Role.OPERATIONS_MANAGER] });
    render(<AcceptInvitePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open Stocdup' }));
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('accepts only once even when React runs the effect twice — a second accept would fail the invitee', async () => {
    accept.mockResolvedValue({ distributorId: 'd1', distributorName: 'Vine & Co', roles: [Role.OPERATIONS_MANAGER] });
    render(<StrictMode><AcceptInvitePage /></StrictMode>);

    await screen.findByRole('heading', { name: /Welcome/ });
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('uses the token parked before the Keycloak round trip when the URL has lost it', async () => {
    search.token = null;
    sessionStorage.setItem('stocdup_pending_staff_invite', 'parked-token');
    accept.mockResolvedValue({ distributorId: 'd1', distributorName: 'Vine & Co', roles: [Role.WAREHOUSE_STAFF] });
    render(<AcceptInvitePage />);

    await screen.findByRole('heading', { name: /Welcome/ });
    expect(accept).toHaveBeenCalledWith('parked-token');
  });

  it('names a fully set-up account too (someone already using Stocdup in this browser)', async () => {
    auth.identity = null; // only set for onboarding / access-denied sessions
    auth.identityEmail = 'james@vineandco.com';
    accept.mockRejectedValue(new ApiError(problem('This invitation was sent to a different email address', 403), 403));
    render(<AcceptInvitePage />);

    expect(await screen.findByText('james@vineandco.com')).toBeInTheDocument();
  });

  it.each([404, 410])('gives expired, withdrawn and unknown links one answer (%s)', async (status) => {
    accept.mockRejectedValue(new ApiError(problem('nope', status), status));
    render(<AcceptInvitePage />);

    expect(await screen.findByRole('heading', { name: 'This invitation is no longer valid' })).toBeInTheDocument();
    expect(screen.getByText(/Invitations are valid for 7 days/)).toBeInTheDocument();
    expect(sessionStorage.getItem('stocdup_pending_staff_invite')).toBeNull();
  });

  it('shows the server’s reason when the invitation cannot be used (already accepted, or already in a company)', async () => {
    accept.mockRejectedValue(new ApiError(problem('This invitation has already been accepted', 409), 409));
    render(<AcceptInvitePage />);

    expect(await screen.findByRole('heading', { name: 'This invitation can’t be used' })).toBeInTheDocument();
    expect(screen.getByText('This invitation has already been accepted')).toBeInTheDocument();
  });

  it('keeps the token and offers a reload when something transient goes wrong', async () => {
    sessionStorage.setItem('stocdup_pending_staff_invite', 'emailed-token');
    accept.mockRejectedValue(new Error('network'));
    render(<AcceptInvitePage />);

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(sessionStorage.getItem('stocdup_pending_staff_invite')).toBe('emailed-token');
  });

  it('waits for the session to load before deciding anything', () => {
    auth.isLoading = true;
    render(<AcceptInvitePage />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(accept).not.toHaveBeenCalled();
    void waitFor;
  });
});

describe('Accept invitation — signed in with another address', () => {
  const mismatch = () => new ApiError(problem('This invitation was sent to a different email address', 403), 403);

  beforeEach(() => {
    auth.accessToken = 'kc-token';
    auth.identity = { email: 'sam.p@gmail.com' };
    accept.mockRejectedValueOnce(mismatch());
  });

  const openCodeStep = async () => {
    render(<AcceptInvitePage />);
    await screen.findByRole('heading', { name: 'Confirm you can use this invitation' });
  };

  it('offers a code sent to the invited address, naming both addresses, and keeps the invitation', async () => {
    sessionStorage.setItem('stocdup_pending_staff_invite', 'emailed-token');
    await openCodeStep();

    expect(await screen.findAllByText('sam@vine.test')).not.toHaveLength(0);
    expect(screen.getByText('sam.p@gmail.com')).toBeInTheDocument();
    expect(sessionStorage.getItem('stocdup_pending_staff_invite')).toBe('emailed-token');
    expect(sendCode).not.toHaveBeenCalled(); // nothing is emailed until they ask
  });

  it('emails a code, then accepts with the code they type', async () => {
    await openCodeStep();
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(sendCode).toHaveBeenCalledWith('emailed-token');

    accept.mockResolvedValueOnce({ distributorId: 'd1', distributorName: 'Vine & Co', roles: [Role.WAREHOUSE_STAFF] });
    await userEvent.type(screen.getByLabelText('Code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('heading', { name: /Welcome to Vine & Co/ })).toBeInTheDocument();
    expect(accept).toHaveBeenLastCalledWith('emailed-token', '123456');
    expect(refreshSession).toHaveBeenCalled();
  });

  it('shows why a code was refused and lets them try again', async () => {
    await openCodeStep();
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    accept.mockRejectedValueOnce(new ApiError(problem("That code isn't right. 4 tries left.", 422), 422));
    await userEvent.type(screen.getByLabelText('Code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("That code isn't right. 4 tries left.");
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });

  it('shows the wait message when a new code is asked for too soon', async () => {
    await openCodeStep();
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    sendCode.mockRejectedValueOnce(new ApiError(problem('We sent a code less than a minute ago. Wait a moment, then send a new one.', 429), 429));
    await userEvent.click(screen.getByRole('button', { name: 'Send a new code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We sent a code less than a minute ago');
  });

  it('keeps Confirm off until six digits are typed', async () => {
    await openCodeStep();
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    await userEvent.type(screen.getByLabelText('Code'), '123');
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });

  it('can still sign out and use the invited address instead', async () => {
    await openCodeStep();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out and use sam@vine.test instead' }));
    expect(logoutWithRedirect).toHaveBeenCalledWith('/accept-invite?token=emailed-token');
  });
});
