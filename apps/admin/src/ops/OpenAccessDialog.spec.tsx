import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@wholo/admin-api-client';

const openAccess = vi.fn();
vi.mock('./api', () => ({ opsApi: { openAccess: (...a: unknown[]) => openAccess(...a) } }));
const enterWholesaler = vi.fn();
vi.mock('./navigation', () => ({ enterWholesaler: (g: unknown) => enterWholesaler(g) }));

import { OpenAccessDialog } from './OpenAccessDialog';

const now = () => new Date('2026-10-23T09:00:00');

describe('OpenAccessDialog', () => {
  afterEach(() => vi.clearAllMocks());

  it('needs a reason before access can be opened', async () => {
    render(<OpenAccessDialog distributor={{ id: 'dist-1', name: 'Vine & Co' }} onClose={vi.fn()} now={now} />);
    const open = screen.getByRole('button', { name: 'Open Vine & Co' });
    expect(open).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/why are you opening/i), '   ');
    expect(open).toBeDisabled();
  });

  it('defaults to 4 hours and shows when access would end', async () => {
    render(<OpenAccessDialog distributor={{ id: 'dist-1', name: 'Vine & Co' }} onClose={vi.fn()} now={now} />);
    expect(screen.getByRole('radio', { name: '4 hours' })).toBeChecked();
    expect(screen.getByText('Access ends at 13:00.')).toBeInTheDocument();
    await userEvent.click(screen.getByText('1 hour'));
    expect(screen.getByText('Access ends at 10:00.')).toBeInTheDocument();
  });

  it('opens access for the chosen length, then enters the wholesaler', async () => {
    const grant = { id: 'g-1', distributorId: 'dist-1', distributorName: 'Vine & Co', expiresAt: 'x', reason: 'Price lists' };
    openAccess.mockResolvedValue(grant);
    render(<OpenAccessDialog distributor={{ id: 'dist-1', name: 'Vine & Co' }} onClose={vi.fn()} now={now} />);
    await userEvent.type(screen.getByLabelText(/why are you opening/i), ' Price lists ');
    await userEvent.click(screen.getByText('8 hours'));
    await userEvent.click(screen.getByRole('button', { name: 'Open Vine & Co' }));
    await waitFor(() => expect(enterWholesaler).toHaveBeenCalledWith(grant));
    expect(openAccess).toHaveBeenCalledWith('dist-1', 'Price lists', 480);
  });

  it('shows why apps/api refused', async () => {
    openAccess.mockRejectedValue(new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, detail: 'You are already a member of this distributor' }, 409));
    render(<OpenAccessDialog distributor={{ id: 'dist-1', name: 'Vine & Co' }} onClose={vi.fn()} now={now} />);
    await userEvent.type(screen.getByLabelText(/why are you opening/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Open Vine & Co' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already a member');
    expect(enterWholesaler).not.toHaveBeenCalled();
  });
});
