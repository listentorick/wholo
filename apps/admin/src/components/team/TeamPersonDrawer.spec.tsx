import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@wholo/admin-api-client';
import { Role } from '@wholo/types';
import type { StaffInvitation, TeamMember } from '@wholo/types';
import type { TeamEntry } from '@/lib/team';
import { TeamPersonDrawer } from './TeamPersonDrawer';

const api = {
  updateMemberRoles: vi.fn(),
  updateInvitationRoles: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  removeMember: vi.fn(),
};
vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return { ...actual, adminTeamApi: new Proxy({}, { get: (_t, k: string) => (...a: unknown[]) => (api as Record<string, (...x: unknown[]) => unknown>)[k](...a) }) };
});
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { organisationName: 'Vine & Co' } }) }));

const tom: TeamMember = {
  userId: 'u-tom', firstName: 'Tom', lastName: 'Reid', email: 'tom@vine.test',
  roles: [Role.OPERATIONS_MANAGER], joinedAt: '2026-06-02T09:00:00Z', invitedBy: 'Priya Shah',
};
const memberEntry = (over: Partial<Extract<TeamEntry, { kind: 'member' }>> = {}): TeamEntry =>
  ({ kind: 'member', id: tom.userId, member: tom, isSelf: false, isOwner: false, ...over });
const inv = (over: Partial<StaffInvitation> = {}): StaffInvitation => ({
  id: 'i-1', email: 'kofi@vine.test', roles: [Role.WAREHOUSE_STAFF], status: 'PENDING',
  expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(), createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  invitedBy: { id: 'u-priya', name: 'Priya Shah' }, ...over,
});
const invEntry = (over: Partial<StaffInvitation> = {}): TeamEntry => ({ kind: 'invitation', id: 'i-1', invitation: inv(over) });
const problem = (detail: string, status: number) => ({ type: 'about:blank', title: 'Error', status, detail });

const onClose = vi.fn();
const onChanged = vi.fn();
const open = (entry: TeamEntry) => render(<TeamPersonDrawer entry={entry} onClose={onClose} onChanged={onChanged} />);
const checkbox = (name: RegExp) => screen.getByRole('checkbox', { name });

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(api)) fn.mockResolvedValue(undefined);
});

describe('TeamPersonDrawer — a team member', () => {
  it('shows who they are, their roles, and when they joined', () => {
    open(memberEntry());
    expect(screen.getByRole('heading', { name: 'Tom Reid' })).toBeInTheDocument();
    expect(screen.getByText('tom@vine.test')).toBeInTheDocument();
    expect(checkbox(/Operations manager/)).toBeChecked();
    expect(checkbox(/Warehouse staff/)).not.toBeChecked();
    expect(screen.getByText('2 Jun 2026')).toBeInTheDocument();
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
  });

  it('keeps Save disabled until the roles change, then saves the new set', async () => {
    open(memberEntry());
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    await userEvent.click(checkbox(/Warehouse staff/));
    expect(save).toBeEnabled();
    await userEvent.click(save);

    await waitFor(() => expect(api.updateMemberRoles).toHaveBeenCalledWith('u-tom', { roles: [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF] }));
    expect(onChanged).toHaveBeenCalled();
  });

  it('will not let every role be removed, and points at Remove from team instead', async () => {
    open(memberEntry());
    await userEvent.click(checkbox(/Operations manager/));

    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one role. To take away all access, remove Tom from the team instead.');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('shows the server’s reason when a save is refused', async () => {
    api.updateMemberRoles.mockRejectedValue(new ApiError(problem('The Owner’s roles can’t be changed here.', 403), 403));
    open(memberEntry());
    await userEvent.click(checkbox(/Warehouse staff/));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/roles can’t be changed here/)).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('removes them only after confirming, saying what that means and what stays', async () => {
    open(memberEntry());
    await userEvent.click(screen.getByRole('button', { name: 'Remove from team' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Remove Tom Reid from the team?' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('signed out and can no longer sign in');
    expect(dialog).toHaveTextContent('Vine & Co');
    expect(dialog).toHaveTextContent('past orders, deliveries and activity remain on record');
    expect(api.removeMember).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove from team' }));
    await waitFor(() => expect(api.removeMember).toHaveBeenCalledWith('u-tom'));
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('backs out of a removal without doing anything', async () => {
    open(memberEntry());
    await userEvent.click(screen.getByRole('button', { name: 'Remove from team' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.removeMember).not.toHaveBeenCalled();
  });

  it('keeps the confirmation open with the reason if the removal fails', async () => {
    api.removeMember.mockRejectedValue(new Error('boom'));
    open(memberEntry());
    await userEvent.click(screen.getByRole('button', { name: 'Remove from team' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove from team' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('TeamPersonDrawer — protected people', () => {
  it('shows the Owner’s roles read-only, with no way to edit or remove them', () => {
    open(memberEntry({ isOwner: true, member: { ...tom, roles: [Role.DISTRIBUTOR_ADMIN] } }));

    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText(/The Owner’s roles can’t be changed here/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove from team' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('will not let you change your own roles or remove yourself', () => {
    open(memberEntry({ isSelf: true }));

    expect(screen.getByText('You can’t change your own roles.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove from team' })).not.toBeInTheDocument();
  });
});

describe('TeamPersonDrawer — an invitation', () => {
  it('shows the invited address (read-only), who invited them, and when it was sent and expires', () => {
    open(invEntry());
    expect(screen.getByRole('heading', { name: 'kofi@vine.test' })).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText(/only work for the address they were sent to/)).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText(/in 5 days/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('lets the roles be changed until it is accepted', async () => {
    open(invEntry());
    await userEvent.click(checkbox(/Operations manager/));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.updateInvitationRoles).toHaveBeenCalledWith('i-1', { roles: [Role.WAREHOUSE_STAFF, Role.OPERATIONS_MANAGER] }));
  });

  it('resends with a fresh link and closes, because a resend replaces the invitation', async () => {
    open(invEntry());
    await userEvent.click(screen.getByRole('button', { name: 'Resend invitation' }));

    await waitFor(() => expect(api.resendInvitation).toHaveBeenCalledWith('i-1'));
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('revokes only after confirming that the emailed link stops working', async () => {
    open(invEntry());
    await userEvent.click(screen.getByRole('button', { name: 'Revoke invitation' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('The link in the email stops working');
    expect(api.revokeInvitation).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke invitation' }));
    await waitFor(() => expect(api.revokeInvitation).toHaveBeenCalledWith('i-1'));
    expect(onClose).toHaveBeenCalled();
  });

  it('for an expired one, offers resend and revoke but not role editing', () => {
    open(invEntry({ status: 'EXPIRED', expiresAt: new Date(Date.now() - 5 * 86400000).toISOString() }));

    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText(/Resend it to send a fresh link/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend invitation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke invitation' })).toBeInTheDocument();
  });
});
