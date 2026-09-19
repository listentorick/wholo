import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@wholo/admin-api-client';
import { Role } from '@wholo/types';
import { InviteTeamMemberModal } from './InviteTeamMemberModal';

const invite = vi.fn();
vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return { ...actual, adminTeamApi: { invite: (...a: unknown[]) => invite(...a) } };
});

const problem = (detail: string, status: number) => ({ type: 'about:blank', title: 'Error', status, detail });

beforeEach(() => vi.clearAllMocks());

async function fill(email: string, ...roles: RegExp[]) {
  await userEvent.type(screen.getByLabelText('Email'), email);
  for (const r of roles) await userEvent.click(screen.getByRole('checkbox', { name: r }));
}

describe('InviteTeamMemberModal', () => {
  it('sends the invitation with the chosen roles and hands the result back', async () => {
    const onInvited = vi.fn();
    invite.mockResolvedValue({ id: 'inv-1', email: 'sam@vine.test' });
    render(<InviteTeamMemberModal onClose={vi.fn()} onInvited={onInvited} />);

    await fill('  sam@vine.test ', /Operations manager/, /Warehouse staff/);
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => expect(onInvited).toHaveBeenCalledWith({ id: 'inv-1', email: 'sam@vine.test' }));
    expect(invite).toHaveBeenCalledWith({ email: 'sam@vine.test', roles: [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF] });
  });

  it('asks for a role before sending anything', async () => {
    render(<InviteTeamMemberModal onClose={vi.fn()} onInvited={vi.fn()} />);

    await fill('sam@vine.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(screen.getByText('Choose at least one role.')).toBeInTheDocument();
    expect(invite).not.toHaveBeenCalled();
  });

  it.each([
    ['', 'Enter their email address.'],
    ['not-an-email', 'That doesn’t look like an email address.'],
  ])('rejects the email %j before sending', async (email, message) => {
    render(<InviteTeamMemberModal onClose={vi.fn()} onInvited={vi.fn()} />);

    if (email) await userEvent.type(screen.getByLabelText('Email'), email);
    await userEvent.click(screen.getByRole('checkbox', { name: /Warehouse staff/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(invite).not.toHaveBeenCalled();
  });

  it('shows the server’s "already has an account" answer against the email field, and stays open', async () => {
    invite.mockRejectedValue(new ApiError(problem('This email already has a Stocdup account, so it can’t be invited. Use a different address.', 409), 409));
    const onInvited = vi.fn();
    render(<InviteTeamMemberModal onClose={vi.fn()} onInvited={onInvited} />);

    await fill('tom@vine.test', /Operations manager/);
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(await screen.findByText(/already has a Stocdup account/)).toBeInTheDocument();
    expect(onInvited).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeEnabled(); // can correct and retry
  });

  it('says so plainly when sending fails for another reason', async () => {
    invite.mockRejectedValue(new Error('network'));
    render(<InviteTeamMemberModal onClose={vi.fn()} onInvited={vi.fn()} />);

    await fill('sam@vine.test', /Operations manager/);
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t send the invitation. Try again.');
  });

  it('cannot be dismissed or resubmitted while the invitation is being sent', async () => {
    let finish: (v: unknown) => void = () => undefined;
    invite.mockReturnValue(new Promise((r) => (finish = r)));
    render(<InviteTeamMemberModal onClose={vi.fn()} onInvited={vi.fn()} />);

    await fill('sam@vine.test', /Operations manager/);
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    finish({ id: 'x' });
  });

  it('closes on Cancel', async () => {
    const onClose = vi.fn();
    render(<InviteTeamMemberModal onClose={onClose} onInvited={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
