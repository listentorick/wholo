import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role } from '@wholo/types';
import type { StaffInvitation, TeamMember, TeamOverview } from '@wholo/types';
import TeamPage from './page';

const auth: { user: { id: string; permissions: string[]; organisationName: string } | null; accessToken: string | null } = {
  user: { id: 'u-priya', permissions: ['team:manage'], organisationName: 'Vine & Co' },
  accessToken: 'tok',
};
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth }));

const overview = vi.fn();
const invite = vi.fn();
vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return {
    ...actual,
    adminTeamApi: {
      overview: () => overview(),
      invite: (...a: unknown[]) => invite(...a),
      updateMemberRoles: vi.fn(), updateInvitationRoles: vi.fn(), resendInvitation: vi.fn(), revokeInvitation: vi.fn(), removeMember: vi.fn(),
    },
  };
});

const DAY = 86400000;
const priya: TeamMember = { userId: 'u-priya', firstName: 'Priya', lastName: 'Shah', email: 'priya@vine.test', roles: [Role.DISTRIBUTOR_ADMIN], joinedAt: '2025-03-12T09:00:00Z', invitedBy: null };
const tom: TeamMember = { userId: 'u-tom', firstName: 'Tom', lastName: 'Reid', email: 'tom@vine.test', roles: [Role.OPERATIONS_MANAGER], joinedAt: '2026-06-02T09:00:00Z', invitedBy: 'Priya Shah' };
const inv = (o: Partial<StaffInvitation>): StaffInvitation => ({
  id: 'i-kofi', email: 'kofi@vine.test', roles: [Role.WAREHOUSE_STAFF], status: 'PENDING',
  expiresAt: new Date(Date.now() + 5 * DAY).toISOString(), createdAt: new Date(Date.now() - 2 * DAY).toISOString(),
  invitedBy: { id: 'u-priya', name: 'Priya Shah' }, ...o,
});
const fullTeam = (): TeamOverview => ({
  members: [priya, tom],
  invitations: [inv({}), inv({ id: 'i-dana', email: 'dana@vine.test', status: 'EXPIRED', expiresAt: new Date(Date.now() - 5 * DAY).toISOString() })],
});

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: 'u-priya', permissions: ['team:manage'], organisationName: 'Vine & Co' };
  auth.accessToken = 'tok';
  overview.mockResolvedValue(fullTeam());
});

describe('Team page', () => {
  it('lists people and invitations together, marking you, with a count on every filter', async () => {
    render(<TeamPage />);

    expect((await screen.findAllByText('kofi@vine.test')).length).toBeGreaterThan(0);
    // Desktop table and phone card list both render (CSS picks one), so look in the table.
    const table = screen.getAllByRole('table')[0];
    expect(within(table).getByText('(You)')).toBeInTheDocument();
    expect(within(table).getByText('Owner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All 4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pending 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expired 1' })).toBeInTheDocument();
  });

  it('filters by status', async () => {
    render(<TeamPage />);
    await screen.findAllByText('kofi@vine.test');

    await userEvent.click(screen.getByRole('button', { name: 'Pending 1' }));
    const table = screen.getAllByRole('table')[0];
    expect(within(table).getByText('kofi@vine.test')).toBeInTheDocument();
    expect(within(table).queryByText('dana@vine.test')).not.toBeInTheDocument();
    expect(within(table).queryByText('Tom Reid')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Active 2' }));
    expect(within(screen.getAllByRole('table')[0]).getByText('Tom Reid')).toBeInTheDocument();
  });

  it('says so when a filter has nothing in it', async () => {
    overview.mockResolvedValue({ members: [priya, tom], invitations: [] });
    render(<TeamPage />);
    await screen.findAllByText('Tom Reid');

    await userEvent.click(screen.getByRole('button', { name: 'Pending 0' }));
    expect(screen.getByText('No pending invitations.')).toBeInTheDocument();
  });

  it('opens the person drawer when a row is clicked, and closes it again', async () => {
    render(<TeamPage />);
    await screen.findAllByText('kofi@vine.test');

    await userEvent.click(screen.getAllByRole('button', { name: 'Open kofi@vine.test' })[0]);
    expect(await screen.findByRole('button', { name: 'Revoke invitation' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('button', { name: 'Revoke invitation' })).not.toBeInTheDocument();
  });

  it('invites someone from the header button, and shows them straight away as pending', async () => {
    render(<TeamPage />);
    await screen.findAllByText('kofi@vine.test');
    invite.mockResolvedValue(inv({ id: 'i-sam', email: 'sam@vine.test', roles: [Role.OPERATIONS_MANAGER] }));
    overview.mockResolvedValue({ ...fullTeam(), invitations: [inv({ id: 'i-sam', email: 'sam@vine.test', roles: [Role.OPERATIONS_MANAGER] }), ...fullTeam().invitations] });

    await userEvent.click(screen.getByRole('button', { name: 'Invite team member' }));
    await userEvent.type(screen.getByLabelText('Email'), 'sam@vine.test');
    await userEvent.click(screen.getByRole('checkbox', { name: /Operations manager/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await screen.findAllByText('sam@vine.test')).length).toBeGreaterThan(0);
    expect(overview).toHaveBeenCalledTimes(2); // reloaded after inviting
  });

  it('invites the first person when it is just you, via the empty state', async () => {
    overview.mockResolvedValue({ members: [priya], invitations: [] });
    render(<TeamPage />);

    expect(await screen.findByText('It’s just you for now')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Invite team member' });
    await userEvent.click(buttons[buttons.length - 1]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not show the "just you" prompt once someone else is on the team', async () => {
    render(<TeamPage />);
    await screen.findAllByText('Tom Reid');
    expect(screen.queryByText('It’s just you for now')).not.toBeInTheDocument();
  });

  it('shows an error, not an empty team, when it cannot load', async () => {
    overview.mockRejectedValue(new Error('down'));
    render(<TeamPage />);
    expect(await screen.findByText(/Couldn.t load your team/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All 0' })).not.toBeInTheDocument();
  });

  it('does not load or show the team to someone without team management', async () => {
    auth.user = { id: 'u-ops', permissions: ['orders:manage'], organisationName: 'Vine & Co' };
    render(<TeamPage />);

    expect(screen.getByText('Only the Owner can manage the team.')).toBeInTheDocument();
    expect(overview).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Invite team member' })).not.toBeInTheDocument();
  });
});
