import { AccountingProvider, Prisma } from '@prisma/client';

// A distributor's link to one organisation in an accounting system. A
// reconnect creates a new AccountingConnection row (ADR-051 keeps the old
// ones), but invoices exported under the old row still live in the same
// provider organisation — so anything that follows those invoices must match
// on the organisation, not the connection row (ADR-072).
export interface AccountingOrganisationRef {
  distributorId: string;
  provider: AccountingProvider;
  externalOrganisationId: string;
}

export function organisationKey(ref: AccountingOrganisationRef): string {
  return `${ref.distributorId}|${ref.provider}|${ref.externalOrganisationId}`;
}

// Invoice exports made under any of this distributor's connections to the
// same provider organisation, whichever connection row created them.
export function exportsForOrganisation(ref: AccountingOrganisationRef): Prisma.AccountingInvoiceExportWhereInput {
  return {
    distributorId: ref.distributorId,
    connection: {
      distributorId: ref.distributorId,
      provider: ref.provider,
      externalOrganisationId: ref.externalOrganisationId,
    },
  };
}
