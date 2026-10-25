import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Permission, type SupportGrant } from '@wholo/types';

let active: Partial<SupportGrant>[] = [];
vi.mock('@/lib/support-presence-context', () => ({ useSupportPresence: () => ({ active, refresh: vi.fn() }) }));
let permissions: string[] = [];
vi.mock('@/lib/permissions', () => ({ useCan: () => (p: string) => permissions.includes(p) }));

import { SupportPresenceStrip } from './SupportPresenceStrip';

const visit = { id: 'g-1', holder: { id: 'op', name: 'Rick Walsh' }, reason: 'Price lists', expiresAt: '2026-10-23T13:00:00Z' };

describe('SupportPresenceStrip', () => {
  it('tells everyone while Stocdup support is in', () => {
    active = [visit];
    permissions = [];
    render(<SupportPresenceStrip />);
    expect(screen.getByText('Stocdup support is in your account')).toBeInTheDocument();
    expect(screen.getByText(/Rick Walsh, until .* · Price lists/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review' })).toBeNull();
  });

  it('gives the Owner a link to review it', () => {
    active = [visit];
    permissions = [Permission.TEAM_MANAGE];
    render(<SupportPresenceStrip />);
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/team#support-access');
  });

  it('shows nothing when nobody is in', () => {
    active = [];
    const { container } = render(<SupportPresenceStrip />);
    expect(container).toBeEmptyDOMElement();
  });
});
