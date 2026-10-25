import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SupportGrant } from '@wholo/types';

const supportGrants = vi.fn();
const endSupportGrant = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({
  adminTeamApi: { supportGrants: (...a: unknown[]) => supportGrants(...a), endSupportGrant: (...a: unknown[]) => endSupportGrant(...a) },
}));

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/lib/permissions', () => ({ useCan: () => () => true }));

import { SupportPresenceProvider } from '@/lib/support-presence-context';
import { SupportAccessSection } from './SupportAccessSection';
import { SupportPresenceStrip } from './SupportPresenceStrip';

// As in the app: the strip on every page and the Team page share the provider.
function renderTeamPage() {
  return render(
    <SupportPresenceProvider>
      <SupportPresenceStrip />
      <SupportAccessSection />
    </SupportPresenceProvider>,
  );
}

function grant(overrides: Partial<SupportGrant>): SupportGrant {
  return {
    id: 'g-1', distributorId: 'dist-1', distributorName: 'Vine & Co', distributorSlug: 'vine', holder: { id: 'op', name: 'Rick Walsh' },
    reason: 'Price lists, ticket 142', startsAt: '2026-10-23T09:00:00Z', expiresAt: '2026-10-23T13:00:00Z', revokedAt: null,
    status: 'ACTIVE', endedBy: null, changeCount: 3, ...overrides,
  };
}

describe('SupportAccessSection', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows the visit in progress and how past visits ended', async () => {
    supportGrants.mockResolvedValue([
      grant({}),
      grant({ id: 'g-0', status: 'ENDED', endedBy: 'DISTRIBUTOR', revokedAt: '2026-10-20T10:00:00Z', startsAt: '2026-10-20T09:00:00Z', changeCount: 1 }),
    ]);
    renderTeamPage();
    expect(await screen.findByText(/Rick Walsh is in your account until/)).toBeInTheDocument();
    expect(screen.getByText(/3 recorded changes so far/)).toBeInTheDocument();
    expect(screen.getByText('Ended by your team')).toBeInTheDocument();
    expect(screen.getByText('1 recorded change')).toBeInTheDocument();
  });

  it('lets the Owner end the visit after confirming, and the strip goes at once', async () => {
    let ended = false;
    supportGrants.mockImplementation((opts?: { activeOnly?: boolean }) => {
      if (ended) return Promise.resolve(opts?.activeOnly ? [] : [grant({ status: 'ENDED', endedBy: 'DISTRIBUTOR', revokedAt: '2026-10-23T10:00:00Z' })]);
      return Promise.resolve([grant({})]);
    });
    endSupportGrant.mockImplementation(() => {
      ended = true;
      return Promise.resolve({});
    });
    renderTeamPage();
    expect(await screen.findByText('Stocdup support is in your account')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'End access' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('End Rick Walsh’s access?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'End access' }));
    await waitFor(() => expect(endSupportGrant).toHaveBeenCalledWith('g-1'));
    expect(await screen.findByText('Ended by your team')).toBeInTheDocument();
    expect(screen.queryByText('Stocdup support is in your account')).toBeNull();
  });

  it('says when support has never been in', async () => {
    supportGrants.mockResolvedValue([]);
    renderTeamPage();
    expect(await screen.findByText('Stocdup support has never opened your account.')).toBeInTheDocument();
  });
});
