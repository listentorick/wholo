-- CreateEnum
CREATE TYPE "AccountingContactMatchStatus" AS ENUM ('SUGGESTED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AccountingContactMatchMethod" AS ENUM ('ACCOUNT_CODE_EXACT', 'EMAIL_EXACT', 'NAME_EXACT', 'NAME_POSTCODE', 'NAME_FUZZY', 'MANUAL');

-- CreateTable
CREATE TABLE "external_accounting_contacts" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "accountingConnectionId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "externalContactId" TEXT NOT NULL,
    "externalContactCode" TEXT,
    "externalAccountNumber" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "billingLine1" TEXT,
    "billingLine2" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingPostcode" TEXT,
    "billingCountry" TEXT,
    "isCustomer" BOOLEAN NOT NULL DEFAULT false,
    "isSupplier" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "ignoredAt" TIMESTAMP(3),
    "lastExternalUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "rawProviderData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_accounting_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_accounting_mappings" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "accountingConnectionId" TEXT NOT NULL,
    "tradeRelationshipId" TEXT NOT NULL,
    "externalContactId" TEXT NOT NULL,
    "matchMethod" "AccountingContactMatchMethod" NOT NULL,
    "linkedByUserId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_accounting_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_contact_match_suggestions" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "accountingConnectionId" TEXT NOT NULL,
    "externalContactId" TEXT NOT NULL,
    "suggestedTradeRelationshipId" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "matchMethod" "AccountingContactMatchMethod" NOT NULL,
    "matchReason" TEXT NOT NULL,
    "status" "AccountingContactMatchStatus" NOT NULL DEFAULT 'SUGGESTED',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_contact_match_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_accounting_contacts_distributorId_isCustomer_isArc_idx" ON "external_accounting_contacts"("distributorId", "isCustomer", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "external_accounting_contacts_accountingConnectionId_externa_key" ON "external_accounting_contacts"("accountingConnectionId", "externalContactId");

-- CreateIndex
CREATE INDEX "customer_accounting_mappings_distributorId_idx" ON "customer_accounting_mappings"("distributorId");

-- CreateIndex
-- Partial: only one active (unlinkedAt IS NULL) mapping per pair, so an
-- unlink-then-relink of the same trade relationship/contact doesn't collide
-- with the closed-out row. Hand-added, same precedent as
-- unique_active_accounting_connection — Prisma's schema DSL cannot express a
-- WHERE clause on a unique index.
CREATE UNIQUE INDEX "customer_accounting_mappings_accountingConnectionId_tradeRe_key"
ON "customer_accounting_mappings"("accountingConnectionId", "tradeRelationshipId")
WHERE "unlinkedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounting_mappings_accountingConnectionId_externa_key"
ON "customer_accounting_mappings"("accountingConnectionId", "externalContactId")
WHERE "unlinkedAt" IS NULL;

-- CreateIndex
CREATE INDEX "accounting_contact_match_suggestions_distributorId_status_idx" ON "accounting_contact_match_suggestions"("distributorId", "status");

-- CreateIndex
CREATE INDEX "accounting_contact_match_suggestions_externalContactId_stat_idx" ON "accounting_contact_match_suggestions"("externalContactId", "status");

-- AddForeignKey
ALTER TABLE "external_accounting_contacts" ADD CONSTRAINT "external_accounting_contacts_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_accounting_contacts" ADD CONSTRAINT "external_accounting_contacts_accountingConnectionId_fkey" FOREIGN KEY ("accountingConnectionId") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_accounting_mappings" ADD CONSTRAINT "customer_accounting_mappings_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_accounting_mappings" ADD CONSTRAINT "customer_accounting_mappings_accountingConnectionId_fkey" FOREIGN KEY ("accountingConnectionId") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_accounting_mappings" ADD CONSTRAINT "customer_accounting_mappings_tradeRelationshipId_fkey" FOREIGN KEY ("tradeRelationshipId") REFERENCES "trade_relationships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_accounting_mappings" ADD CONSTRAINT "customer_accounting_mappings_externalContactId_fkey" FOREIGN KEY ("externalContactId") REFERENCES "external_accounting_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_contact_match_suggestions" ADD CONSTRAINT "accounting_contact_match_suggestions_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_contact_match_suggestions" ADD CONSTRAINT "accounting_contact_match_suggestions_accountingConnectionI_fkey" FOREIGN KEY ("accountingConnectionId") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_contact_match_suggestions" ADD CONSTRAINT "accounting_contact_match_suggestions_externalContactId_fkey" FOREIGN KEY ("externalContactId") REFERENCES "external_accounting_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_contact_match_suggestions" ADD CONSTRAINT "accounting_contact_match_suggestions_suggestedTradeRelatio_fkey" FOREIGN KEY ("suggestedTradeRelationshipId") REFERENCES "trade_relationships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
