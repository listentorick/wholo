import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

const supportGrants = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({ adminTeamApi: { supportGrants: (...a: unknown[]) => supportGrants(...a) } }));
let user: { id: string } | null = null;
vi.mock('./auth-context', () => ({ useAuth: () => ({ user }) }));
let opsBuild = false;
vi.mock('./ops-mode', () => ({
  get isOpsBuild() {
    return opsBuild;
  },
}));

import { SupportPresenceProvider, useSupportPresence } from './support-presence-context';

function Names() {
  const { active } = useSupportPresence();
  return <p>{active.length === 0 ? 'nobody' : active.map((g) => g.holder.name).join(', ')}</p>;
}

const visit = { id: 'g-1', holder: { id: 'op', name: 'Rick Walsh' } };

describe('SupportPresenceProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
    user = null;
    opsBuild = false;
  });

  it('loads the visits open now once someone is signed in', async () => {
    user = { id: 'owner' };
    supportGrants.mockResolvedValue([visit]);
    render(<SupportPresenceProvider><Names /></SupportPresenceProvider>);
    expect(await screen.findByText('Rick Walsh')).toBeInTheDocument();
    expect(supportGrants).toHaveBeenCalledWith({ activeOnly: true });
  });

  it('reloads when the tab is focused again', async () => {
    user = { id: 'owner' };
    supportGrants.mockResolvedValueOnce([visit]).mockResolvedValueOnce([]);
    render(<SupportPresenceProvider><Names /></SupportPresenceProvider>);
    await screen.findByText('Rick Walsh');
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(await screen.findByText('nobody')).toBeInTheDocument();
  });

  it('asks nothing before sign-in, or in the Ops build where the operator is the visitor', async () => {
    render(<SupportPresenceProvider><Names /></SupportPresenceProvider>);
    user = { id: 'operator' };
    opsBuild = true;
    render(<SupportPresenceProvider><Names /></SupportPresenceProvider>);
    await waitFor(() => expect(screen.getAllByText('nobody')).toHaveLength(2));
    expect(supportGrants).not.toHaveBeenCalled();
  });

  it('keeps the last list when a reload fails', async () => {
    user = { id: 'owner' };
    supportGrants.mockResolvedValueOnce([visit]).mockRejectedValueOnce(new Error('down'));
    render(<SupportPresenceProvider><Names /></SupportPresenceProvider>);
    await screen.findByText('Rick Walsh');
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(supportGrants).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Rick Walsh')).toBeInTheDocument();
  });
});
