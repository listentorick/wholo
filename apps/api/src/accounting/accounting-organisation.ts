import { AccountingConnection, Prisma } from '@prisma/client';

// Everything a distributor builds up against an accounting system — cached
// contacts/products/tax rates, links, suggestions, bulk imports, invoices
// sent — belongs to the AccountingOrganisation (the distributor's company in
// that provider), never to the connection row that happened to be live when
// it was written. A reconnect to the same company creates a new connection
// row (ADR-051 keeps them as history) but points at the same organisation,
// so none of it is lost; only a different company starts empty (ADR-074).

export const CONNECTION_WITH_ORGANISATION = { organisation: true } satisfies Prisma.AccountingConnectionInclude;

export type AccountingConnectionWithOrganisation = Prisma.AccountingConnectionGetPayload<{
  include: typeof CONNECTION_WITH_ORGANISATION;
}>;

// The one place the "which company's data" rule lives: every query over
// organisation-owned accounting data scopes itself with this. distributorId
// rides along as a second, independent tenancy guard.
export function organisationScope(connection: Pick<AccountingConnection, 'distributorId' | 'accountingOrganisationId'>): {
  distributorId: string;
  accountingOrganisationId: string;
} {
  return { distributorId: connection.distributorId, accountingOrganisationId: connection.accountingOrganisationId };
}
