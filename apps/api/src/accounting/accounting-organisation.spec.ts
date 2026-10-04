import { organisationScope } from './accounting-organisation';

describe('organisationScope', () => {
  it("scopes to the connection's organisation and distributor, not to the connection row", () => {
    const connection = { id: 'conn-2', distributorId: 'dist-1', accountingOrganisationId: 'acc-org-1' };

    expect(organisationScope(connection)).toEqual({ distributorId: 'dist-1', accountingOrganisationId: 'acc-org-1' });
  });

  it('gives the same scope for every connection to the same organisation', () => {
    const first = { id: 'conn-1', distributorId: 'dist-1', accountingOrganisationId: 'acc-org-1' };
    const reconnect = { id: 'conn-2', distributorId: 'dist-1', accountingOrganisationId: 'acc-org-1' };

    expect(organisationScope(reconnect)).toEqual(organisationScope(first));
  });
});
