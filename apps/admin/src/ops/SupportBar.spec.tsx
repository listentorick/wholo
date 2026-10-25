import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const endAccess = vi.fn();
vi.mock('./api', () => ({ opsApi: { endAccess: (...a: unknown[]) => endAccess(...a) } }));
const leaveWholesaler = vi.fn();
vi.mock('./navigation', () => ({ leaveWholesaler: (c: string) => leaveWholesaler(c), endedCause: () => 'EXPIRED' }));
const confirmSelection = vi.fn();
vi.mock('./scope', () => ({ confirmSelection: () => confirmSelection() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/pricelists' }));

import { SupportBar } from './SupportBar';
import { clearSelection, setSelection } from './selection';
import { formatClock } from './time';

const inFourHours = () => new Date(Date.now() + 4 * 3600_000).toISOString();

describe('SupportBar', () => {
  afterEach(() => {
    vi.useRealTimers();
    clearSelection();
    vi.clearAllMocks();
  });

  it('names the wholesaler, the reason and when access ends, and titles the tab', () => {
    setSelection({ distributorId: 'dist-1', name: 'Vine & Co', grantId: 'g-1', expiresAt: inFourHours(), reason: 'Price lists, ticket 142' });
    render(<SupportBar />);
    expect(screen.getByRole('region', { name: 'Stocdup support in Vine & Co' })).toBeInTheDocument();
    expect(screen.getByText('Price lists, ticket 142')).toBeInTheDocument();
    expect(screen.getByText(/Access ends/)).toBeInTheDocument();
    expect(document.title).toBe('OPS · Vine & Co · Pricelists');
  });

  it('warns when little time is left', () => {
    setSelection({ distributorId: 'dist-1', name: 'Vine & Co', grantId: 'g-1', expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), reason: 'x' });
    render(<SupportBar />);
    expect(screen.getByText('(10m left)')).toBeInTheDocument();
  });

  it('End session ends the access, then leaves the wholesaler', async () => {
    endAccess.mockResolvedValue({});
    setSelection({ distributorId: 'dist-1', name: 'Vine & Co', grantId: 'g-1', expiresAt: inFourHours(), reason: 'x' });
    render(<SupportBar />);
    await userEvent.click(screen.getByRole('button', { name: 'End session' }));
    await waitFor(() => expect(leaveWholesaler).toHaveBeenCalledWith('LEFT'));
    expect(endAccess).toHaveBeenCalledWith('dist-1', 'g-1');
  });

  it('stays in the wholesaler and says so when ending the access fails', async () => {
    endAccess.mockRejectedValue(new Error('network'));
    setSelection({ distributorId: 'dist-1', name: 'Vine & Co', grantId: 'g-1', expiresAt: inFourHours(), reason: 'x' });
    render(<SupportBar />);
    await userEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t end the session. Try again.');
    expect(screen.getByRole('button', { name: 'End session' })).toBeEnabled();
    expect(leaveWholesaler).not.toHaveBeenCalled();
  });

  it('goes back to Ops without ending the access', () => {
    setSelection({ distributorId: 'dist-1', name: 'Vine & Co', grantId: 'g-1', expiresAt: inFourHours(), reason: 'x' });
    render(<SupportBar />);
    expect(screen.getByRole('link', { name: 'Back to Ops' })).toHaveAttribute('href', '/ops');
    expect(endAccess).not.toHaveBeenCalled();
  });

  describe('when the access is extended elsewhere', () => {
    const vine = { distributorId: 'dist-1', name: 'Vine & Co', grantId: 'g-1', reason: 'x' };
    const at = (iso: string) => new Date(iso).toISOString();

    // apps/api confirms the access, now ending at `expiresAt`.
    function apiSays(expiresAt: string | 'ENDED' | 'UNKNOWN') {
      confirmSelection.mockImplementation(async () => {
        if (expiresAt === 'ENDED' || expiresAt === 'UNKNOWN') return { status: expiresAt };
        setSelection({ ...vine, expiresAt });
        return { status: 'CONFIRMED', profile: { access: { kind: 'SUPPORT', grantId: 'g-1', expiresAt } } };
      });
    }

    it('stays in the wholesaler at the old end time and shows the new one', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-23T13:00:00Z') });
      setSelection({ ...vine, expiresAt: at('2026-10-23T14:00:00Z') });
      apiSays(at('2026-10-23T16:00:00Z'));
      render(<SupportBar />);

      await act(() => vi.advanceTimersByTimeAsync(60 * 60_000));
      expect(leaveWholesaler).not.toHaveBeenCalled();
      expect(screen.getByText(formatClock(at('2026-10-23T16:00:00Z')))).toBeInTheDocument();
    });

    it('picks up the new end time when the tab regains focus', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-23T13:00:00Z') });
      setSelection({ ...vine, expiresAt: at('2026-10-23T14:00:00Z') });
      apiSays(at('2026-10-23T16:00:00Z'));
      render(<SupportBar />);

      await act(async () => {
        fireEvent.focus(window);
      });
      expect(screen.getByText(formatClock(at('2026-10-23T16:00:00Z')))).toBeInTheDocument();
    });

    it('leaves when apps/api no longer confirms the access at the end time', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-23T13:00:00Z') });
      setSelection({ ...vine, expiresAt: at('2026-10-23T14:00:00Z') });
      apiSays('ENDED');
      render(<SupportBar />);

      await act(() => vi.advanceTimersByTimeAsync(60 * 60_000));
      expect(leaveWholesaler).toHaveBeenCalledWith('EXPIRED');
    });

    it('stays when the access cannot be checked at the end time', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-23T13:00:00Z') });
      setSelection({ ...vine, expiresAt: at('2026-10-23T14:00:00Z') });
      apiSays('UNKNOWN');
      render(<SupportBar />);

      await act(() => vi.advanceTimersByTimeAsync(60 * 60_000));
      expect(leaveWholesaler).not.toHaveBeenCalled();
      expect(screen.getByRole('region', { name: 'Stocdup support in Vine & Co' })).toBeInTheDocument();
    });
  });

  it('renders nothing without a selection', () => {
    const { container } = render(<SupportBar />);
    expect(container).toBeEmptyDOMElement();
  });
});
