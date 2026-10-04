import { AccountingInvoiceTargetStatus, Prisma, PrismaClient } from '@prisma/client';

type ConnectionFixture = Omit<Prisma.AccountingConnectionUncheckedCreateInput, 'accountingOrganisationId'> & {
  // Which company in the provider this connection logged into. Connections
  // with the same distributor + provider + externalOrganisationId share one
  // AccountingOrganisation, exactly as a real reconnect does (ADR-074).
  externalOrganisationId?: string;
  externalOrganisationName?: string;
  invoiceExportTargetStatus?: AccountingInvoiceTargetStatus;
};

// Creates a connection the way the OAuth callback does: find-or-create the
// organisation it logged into, then a connection row pointing at it.
export async function createAccountingConnection(prisma: PrismaClient, fixture: ConnectionFixture) {
  const {
    externalOrganisationId = 'tenant-1',
    externalOrganisationName = 'Test Organisation',
    invoiceExportTargetStatus,
    ...connection
  } = fixture;
  const organisationKey = { distributorId: connection.distributorId, provider: connection.provider, externalOrganisationId };
  const organisation = await prisma.accountingOrganisation.upsert({
    where: { distributorId_provider_externalOrganisationId: organisationKey },
    create: { ...organisationKey, name: externalOrganisationName, ...(invoiceExportTargetStatus && { invoiceExportTargetStatus }) },
    update: { name: externalOrganisationName, ...(invoiceExportTargetStatus && { invoiceExportTargetStatus }) },
  });
  return prisma.accountingConnection.create({
    data: { ...connection, accountingOrganisationId: organisation.id },
    include: { organisation: true },
  });
}
