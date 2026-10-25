import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const myGrants = vi.fn();
const endAccess = vi.fn();
vi.mock('./api', () => ({ opsApi: { myGrants: () => myGrants(), endAccess: (...a: unknown[]) => endAccess(...a) } }));
const leaveWholesaler = vi.fn();
vi.mock('./navigation', () => ({ enterWholesaler: vi.fn(), leaveWholesaler: (cause: string) => leaveWholesaler(cause) }));

import { MyAccessPage } from './MyAccessPage';
import { supportGrant } from './fixtures';
import { clearSelection, getSelection, setSelection } from './selection';

const open = supportGrant({ id: 'g-open' });
const past = [
  supportGrant({ id: 'g-expired', distributorName: 'Rogers Bakery', status: 'EXPIRED' }),
  supportGrant({ id: 'g-mine', distributorName: 'Goo Cheese', status: 'ENDED', endedBy: 'HOLDER' }),
  supportGrant({ id: 'g-theirs', distributorName: 'Crofters Foods', status: 'ENDED', endedBy: 'DISTRIBUTOR' }),
  supportGrant({ id: 'g-other-op', distributorName: 'Cryer and Stott', status: 'ENDED', endedBy: 'STOCDUP' }),
];

describe('MyAccessPage', () => {
  afterEach(() => {
    clearSelection();
    vi.clearAllMocks();
  });

  it('shows what is open now and how earlier visits ended', async () => {
    myGrants.mockResolvedValue([open, ...past]);
    render(<MyAccessPage />);

    expect(await screen.findByRole('button', { name: 'End now' })).toBeInTheDocument();
    for (const [name, ended] of [
      ['Rogers Bakery', 'Time ran out'],
      ['Goo Cheese', 'You ended it'],
      ['Crofters Foods', 'Ended by the wholesaler'],
      ['Cryer and Stott', 'Ended by another operator'],
    ]) {
      expect(within(screen.getByText(name).closest('li')!).getByText(ended)).toBeInTheDocument();
    }
  });

  it('says when nothing is open and there is no history', async () => {
    myGrants.mockResolvedValue([]);
    render(<MyAccessPage />);
    expect(await screen.findByText('You have no access open.')).toBeInTheDocument();
    expect(screen.getByText('No earlier visits.')).toBeInTheDocument();
  });

  it('leaves the wholesaler, as End session does, when ending the visit this tab is in', async () => {
    myGrants.mockResolvedValue([open]);
    endAccess.mockResolvedValue({});
    setSelection({ distributorId: 'dist-1', name: 'Vine & Co', grantId: 'g-open', expiresAt: open.expiresAt, reason: open.reason });
    render(<MyAccessPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'End now' }));

    await waitFor(() => expect(leaveWholesaler).toHaveBeenCalledWith('LEFT'));
    expect(endAccess).toHaveBeenCalledWith(open.distributorId, 'g-open');
  });

  it('ends a visit no tab is in and shows it as ended', async () => {
    myGrants.mockResolvedValueOnce([open]).mockResolvedValueOnce([{ ...open, status: 'ENDED', endedBy: 'HOLDER' }]);
    endAccess.mockResolvedValue({});
    render(<MyAccessPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'End now' }));

    expect(await screen.findByText('You ended it')).toBeInTheDocument();
    expect(leaveWholesaler).not.toHaveBeenCalled();
  });

  it('keeps another tab’s wholesaler when ending a different grant', async () => {
    myGrants.mockResolvedValue([open]);
    endAccess.mockResolvedValue({});
    setSelection({ distributorId: 'dist-9', name: 'Other', grantId: 'g-other', expiresAt: open.expiresAt, reason: 'x' });
    render(<MyAccessPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'End now' }));

    await waitFor(() => expect(myGrants).toHaveBeenCalledTimes(2));
    expect(getSelection()).toMatchObject({ grantId: 'g-other' });
    expect(leaveWholesaler).not.toHaveBeenCalled();
  });

  it('says so when ending fails', async () => {
    myGrants.mockResolvedValue([open]);
    endAccess.mockRejectedValue(new Error('network'));
    render(<MyAccessPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'End now' }));
    expect(await screen.findByText('Couldn’t end access. Please try again.')).toBeInTheDocument();
  });

  it('says so when the list cannot be loaded', async () => {
    myGrants.mockRejectedValue(new Error('network'));
    render(<MyAccessPage />);
    expect(await screen.findByText('Couldn’t load your access. Please refresh.')).toBeInTheDocument();
  });
});
