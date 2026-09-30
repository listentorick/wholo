import { exportsForOrganisation, organisationKey } from './accounting-organisation';

const ref = { distributorId: 'dist-1', provider: 'XERO' as const, externalOrganisationId: 'org-x' };

describe('organisationKey', () => {
  it('is the same for any connection row to the same organisation, and differs by distributor, provider or organisation', () => {
    expect(organisationKey({ ...ref })).toBe(organisationKey({ ...ref }));
    expect(organisationKey({ ...ref, distributorId: 'dist-2' })).not.toBe(organisationKey(ref));
    expect(organisationKey({ ...ref, externalOrganisationId: 'org-y' })).not.toBe(organisationKey(ref));
  });
});

describe('exportsForOrganisation', () => {
  it("matches the distributor's exports by the connection's organisation, not by connection row", () => {
    expect(exportsForOrganisation(ref)).toEqual({
      distributorId: 'dist-1',
      connection: { distributorId: 'dist-1', provider: 'XERO', externalOrganisationId: 'org-x' },
    });
  });
});
