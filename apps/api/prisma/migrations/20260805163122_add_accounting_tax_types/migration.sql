-- CreateEnum
CREATE TYPE "AccountingTaxTypeMatchStatus" AS ENUM ('SUGGESTED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AccountingTaxTypeMatchMethod" AS ENUM ('NAME_EXACT', 'NAME_NORMALISED', 'NAME_FUZZY', 'MANUAL');

-- AlterTable
ALTER TABLE "external_accounting_contacts" ADD COLUMN     "changeAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "changeDetectedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "external_accounting_products" ADD COLUMN     "changeAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "changeDetectedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "external_accounting_tax_types" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "accountingConnectionId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "taxType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "ratePercentage" DECIMAL(6,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ignoredAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "rawProviderData" JSONB NOT NULL,
    "changeDetectedAt" TIMESTAMP(3),
    "changeAcknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_accounting_tax_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_type_accounting_mappings" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "accountingConnectionId" TEXT NOT NULL,
    "taxTypeId" TEXT NOT NULL,
    "externalTaxTypeId" TEXT NOT NULL,
    "matchMethod" "AccountingTaxTypeMatchMethod" NOT NULL,
    "linkedByUserId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),
    "linkedMarker" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_type_accounting_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_tax_type_match_suggestions" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "accountingConnectionId" TEXT NOT NULL,
    "externalTaxTypeId" TEXT NOT NULL,
    "suggestedTaxTypeId" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "matchMethod" "AccountingTaxTypeMatchMethod" NOT NULL,
    "matchReason" TEXT NOT NULL,
    "status" "AccountingTaxTypeMatchStatus" NOT NULL DEFAULT 'SUGGESTED',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_tax_type_match_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_accounting_tax_types_distributorId_isActive_idx" ON "external_accounting_tax_types"("distributorId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "external_accounting_tax_types_accountingConnectionId_taxTyp_key" ON "external_accounting_tax_types"("accountingConnectionId", "taxType");

-- CreateIndex
CREATE INDEX "tax_type_accounting_mappings_distributorId_idx" ON "tax_type_accounting_mappings"("distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_type_accounting_mappings_accountingConnectionId_taxType_key" ON "tax_type_accounting_mappings"("accountingConnectionId", "taxTypeId", "linkedMarker");

-- CreateIndex
CREATE UNIQUE INDEX "tax_type_accounting_mappings_accountingConnectionId_externa_key" ON "tax_type_accounting_mappings"("accountingConnectionId", "externalTaxTypeId", "linkedMarker");

-- CreateIndex
CREATE INDEX "accounting_tax_type_match_suggestions_distributorId_status_idx" ON "accounting_tax_type_match_suggestions"("distributorId", "status");

-- CreateIndex
CREATE INDEX "accounting_tax_type_match_suggestions_externalTaxTypeId_sta_idx" ON "accounting_tax_type_match_suggestions"("externalTaxTypeId", "status");

-- AddForeignKey
ALTER TABLE "external_accounting_tax_types" ADD CONSTRAINT "external_accounting_tax_types_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_accounting_tax_types" ADD CONSTRAINT "external_accounting_tax_types_accountingConnectionId_fkey" FOREIGN KEY ("accountingConnectionId") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_type_accounting_mappings" ADD CONSTRAINT "tax_type_accounting_mappings_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_type_accounting_mappings" ADD CONSTRAINT "tax_type_accounting_mappings_accountingConnectionId_fkey" FOREIGN KEY ("accountingConnectionId") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_type_accounting_mappings" ADD CONSTRAINT "tax_type_accounting_mappings_taxTypeId_fkey" FOREIGN KEY ("taxTypeId") REFERENCES "tax_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_type_accounting_mappings" ADD CONSTRAINT "tax_type_accounting_mappings_externalTaxTypeId_fkey" FOREIGN KEY ("externalTaxTypeId") REFERENCES "external_accounting_tax_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_tax_type_match_suggestions" ADD CONSTRAINT "accounting_tax_type_match_suggestions_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_tax_type_match_suggestions" ADD CONSTRAINT "accounting_tax_type_match_suggestions_accountingConnection_fkey" FOREIGN KEY ("accountingConnectionId") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_tax_type_match_suggestions" ADD CONSTRAINT "accounting_tax_type_match_suggestions_externalTaxTypeId_fkey" FOREIGN KEY ("externalTaxTypeId") REFERENCES "external_accounting_tax_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_tax_type_match_suggestions" ADD CONSTRAINT "accounting_tax_type_match_suggestions_suggestedTaxTypeId_fkey" FOREIGN KEY ("suggestedTaxTypeId") REFERENCES "tax_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written, not schema.prisma-diffed: same sanctioned exception as the
-- add_active_marker_triggers migration (see ADR-052) — triggers are entirely
-- invisible to every Prisma tool, so this cannot cause schema drift.
--
-- tax_type_accounting_mappings: linkedMarker is true only while unlinkedAt is
-- null — same pattern as product_accounting_mappings/customer_accounting_mappings.
CREATE OR REPLACE FUNCTION set_tax_type_accounting_mapping_marker() RETURNS TRIGGER AS $$
BEGIN
  NEW."linkedMarker" := CASE WHEN NEW."unlinkedAt" IS NULL THEN true ELSE NULL END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_type_accounting_mappings_set_marker
BEFORE INSERT OR UPDATE ON "tax_type_accounting_mappings"
FOR EACH ROW EXECUTE FUNCTION set_tax_type_accounting_mapping_marker();

