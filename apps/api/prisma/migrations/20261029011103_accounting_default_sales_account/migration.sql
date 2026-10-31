-- AlterTable
ALTER TABLE "accounting_organisations" ADD COLUMN     "invoiceDefaultAccountId" TEXT;

-- CreateTable
CREATE TABLE "external_accounting_accounts" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "accountingOrganisationId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "rawProviderData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_accounting_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_accounting_accounts_distributorId_idx" ON "external_accounting_accounts"("distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "external_accounting_accounts_accountingOrganisationId_exter_key" ON "external_accounting_accounts"("accountingOrganisationId", "externalAccountId");

-- AddForeignKey
ALTER TABLE "accounting_organisations" ADD CONSTRAINT "accounting_organisations_invoiceDefaultAccountId_fkey" FOREIGN KEY ("invoiceDefaultAccountId") REFERENCES "external_accounting_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_accounting_accounts" ADD CONSTRAINT "external_accounting_accounts_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_accounting_accounts" ADD CONSTRAINT "external_accounting_accounts_accountingOrganisationId_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
