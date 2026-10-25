import type { SupportGrant } from '@wholo/types';

/** A support grant for specs; override what the test is about. */
export function supportGrant(overrides: Partial<SupportGrant> = {}): SupportGrant {
  return {
    id: 'g-1',
    distributorId: 'dist-1',
    distributorName: 'Vine & Co',
    distributorSlug: 'vineandco',
    holder: { id: 'op-1', name: 'Test Operator' },
    reason: 'Price lists, ticket 142',
    startsAt: '2026-10-23T10:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z',
    revokedAt: null,
    status: 'ACTIVE',
    endedBy: null,
    ...overrides,
  };
}
