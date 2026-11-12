import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Customer, CustomerInvitation } from '@wholo/types';
import { InvitationStatus, TradeRelationshipStatus } from '@wholo/types';
import { PortalAccessTab } from './PortalAccessTab';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@wholo/admin-api-client', () => ({ adminCustomersApi: {} }));

const invite = (overrides: Partial<CustomerInvitation>): CustomerInvitation => ({
  id: 'inv-1',
  email: 'orders@rustyanchor.test',
  status: InvitationStatus.PENDING,
  expiresAt: '2026-11-19T10:00:00.000Z',
  createdAt: '2026-11-12T10:00:00.000Z',
  ...overrides,
});

const customer = (invitations: CustomerInvitation[]) =>
  ({
    id: 'c1',
    status: TradeRelationshipStatus.ACTIVE,
    organisation: { email: 'orders@rustyanchor.test' },
    invitations,
  }) as unknown as Customer;

describe('PortalAccessTab — invitation history', () => {
  it('says who accepted an invitation and when, which can be another address than the invited one', () => {
    render(
      <PortalAccessTab
        mode="tab"
        customer={customer([
          invite({
            status: InvitationStatus.ACCEPTED,
            acceptedAt: '2026-11-13T09:00:00.000Z',
            acceptedBy: { name: 'Rick Walsh', email: 'rick@rustyanchor.test' },
          }),
        ])}
      />,
    );

    expect(screen.getByText('Accepted by Rick Walsh (rick@rustyanchor.test)')).toBeInTheDocument();
    expect(screen.getByText('Accepted 13 Nov 2026')).toBeInTheDocument();
  });

  it('shows the expiry, not an acceptor, for a pending invitation', () => {
    render(<PortalAccessTab mode="tab" customer={customer([invite({})])} />);

    expect(screen.getByText('Expires 19 Nov 2026')).toBeInTheDocument();
    expect(screen.queryByText(/Accepted by/)).not.toBeInTheDocument();
  });
});
