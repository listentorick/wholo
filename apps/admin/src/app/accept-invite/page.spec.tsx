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
const logout = vi.fn();
const refreshSession = vi.fn();
const auth: { accessToken: string | null; isLoading: boolean; identity: { email: string } | null } = {
  accessToken: null, isLoading: false, identity: null,
};
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ ...auth, login, register, logout, refreshSession }),
}));

const accept = vi.fn();
vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return { ...actual, adminTeamApi: { acceptInvitation: (...a: unknown[]) => accept(...a) } };
});

const problem = (detail: string, status: number) => ({ type: 'about:blank', title: 'Error', status, detail });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  search.token = 'emailed-token';
  auth.accessToken = null;
  auth.isLoading = false;
  auth.identity = null;
  refreshSession.mockResolvedValue(undefined);
});

describe('Accept invitation — not signed in', () => {
  it('offers to create an account or sign in, without naming the company (the link is a bearer token)', () => {
    render(<AcceptInvitePage />);

    expect(screen.getByRole('heading', { name: /invited to join a team on Stocdup/ })).toBeInTheDocument();
    expect(screen.getByText(/Use the email address this invitation was sent to/)).toBeInTheDocument();
    expect(accept).not.toHaveBeenCalled();
  });

  it('sends Create your account to Keycloak sign-up, coming back to this same invitation', async () => {
    render(<AcceptInvitePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Create your account' }));
    expect(register).toHaveBeenCalledWith('/accept-invite?token=emailed-token');
  });

  it('sends "I already have an account" to Keycloak sign-in, coming back to this same invitation', async () => {
    render(<AcceptInvitePage />);
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
    expect(login).toHaveBeenCalledWith('/accept-invite?token=emailed-token');
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

  it('explains a wrong-email sign-in, names who they are signed in as, and offers to sign out', async () => {
    auth.identity = { email: 'sam.p@gmail.com' };
    sessionStorage.setItem('stocdup_pending_staff_invite', 'emailed-token');
    accept.mockRejectedValue(new ApiError(problem('This invitation was sent to a different email address', 403), 403));
    render(<AcceptInvitePage />);

    expect(await screen.findByRole('heading', { name: 'This invitation was sent to a different email address' })).toBeInTheDocument();
    expect(screen.getByText('sam.p@gmail.com')).toBeInTheDocument();
    expect(sessionStorage.getItem('stocdup_pending_staff_invite')).toBe('emailed-token'); // still usable with the right address
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalled();
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
