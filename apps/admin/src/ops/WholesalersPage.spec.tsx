import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlatformDistributor } from '@wholo/types';

const distributors = vi.fn();
vi.mock('./api', () => ({ opsApi: { distributors: (...a: unknown[]) => distributors(...a) } }));
const enterWholesaler = vi.fn();
vi.mock('./navigation', () => ({ enterWholesaler: (...a: unknown[]) => enterWholesaler(...a) }));
vi.mock('./OpenAccessDialog', () => ({
  OpenAccessDialog: ({ distributor }: { distributor: { name: string } }) => <div role="dialog">Open {distributor.name}</div>,
}));

import { WholesalersPage } from './WholesalersPage';

function wholesaler(overrides: Partial<PlatformDistributor>): PlatformDistributor {
  return {
    id: 'd-1', name: 'Vine & Co', slug: 'vine', ownerEmail: 'james@vineandco.com', createdAt: '2026-01-01T00:00:00Z',
    activeCustomers: 12, products: 40, ordersLast30Days: 90, lastOrderAt: null, attention: [], myActiveGrant: null, ...overrides,
  };
}

// The desktop table: the phone cards render the same rows, hidden by CSS.
const table = () => screen.getByRole('table');

describe('WholesalersPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('lists wholesalers with what needs attention, and opens one with a reason', async () => {
    distributors.mockResolvedValue([wholesaler({ attention: ['NEW_WITHOUT_PRODUCTS'] })]);
    render(<WholesalersPage />);
    const row = within(await screen.findByRole('table')).getByText('Vine & Co').closest('tr')!;
    expect(within(row).getByText('New, no products yet')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Open…' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Open Vine & Co');
  });

  it('goes straight back in to a wholesaler I already have access to', async () => {
    const grant = { id: 'g-1', expiresAt: '2026-10-23T18:00:00Z', reason: 'Price lists' };
    distributors.mockResolvedValue([wholesaler({ myActiveGrant: grant })]);
    render(<WholesalersPage />);
    await screen.findByRole('table');
    await userEvent.click(within(table()).getByRole('button', { name: 'Continue' }));
    expect(enterWholesaler).toHaveBeenCalledWith({ id: 'g-1', distributorId: 'd-1', distributorName: 'Vine & Co', expiresAt: grant.expiresAt, reason: 'Price lists' });
  });

  it('asks again for the chosen view and says when nothing matches', async () => {
    distributors.mockResolvedValueOnce([wholesaler({})]).mockResolvedValueOnce([]);
    render(<WholesalersPage />);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'I have access' }));
    expect(await screen.findByText('No wholesalers match')).toBeInTheDocument();
    expect(distributors).toHaveBeenLastCalledWith({ filter: 'mine' });
  });

  it('says so when the list cannot load', async () => {
    distributors.mockRejectedValue(new Error('down'));
    render(<WholesalersPage />);
    expect(await screen.findByText('Couldn’t load wholesalers. Please refresh.')).toBeInTheDocument();
  });
});
