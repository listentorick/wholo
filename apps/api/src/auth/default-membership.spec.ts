import { OrganisationType } from '@prisma/client';
import { defaultMembership } from './default-membership';

const of = (organisationId: string, type?: OrganisationType) => ({ organisationId, organisation: type ? { type } : undefined });

describe('defaultMembership', () => {
  it('skips a PLATFORM membership for the wholesaler the operator also works at', () => {
    const memberships = [of('stocdup', OrganisationType.PLATFORM), of('vine', OrganisationType.DISTRIBUTOR)];
    expect(defaultMembership(memberships)?.organisationId).toBe('vine');
  });

  it('keeps the first membership when none is PLATFORM', () => {
    const memberships = [of('cust', OrganisationType.TRADE_CUSTOMER), of('vine', OrganisationType.DISTRIBUTOR)];
    expect(defaultMembership(memberships)?.organisationId).toBe('cust');
  });

  it('has no default for an operator with only the PLATFORM membership', () => {
    expect(defaultMembership([of('stocdup', OrganisationType.PLATFORM)])).toBeUndefined();
  });

  it('has no default without memberships', () => {
    expect(defaultMembership([])).toBeUndefined();
  });

  it('treats a membership without a loaded organisation as usable', () => {
    expect(defaultMembership([of('org-1')])?.organisationId).toBe('org-1');
  });
});
