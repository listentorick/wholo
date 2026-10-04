/*
  Warnings:

  - You are about to drop the column `accountingConnectionId` on the `accounting_bulk_import_jobs` table. All the data in the column will be lost.
  - You are about to drop the column `externalOrganisationId` on the `accounting_connections` table. All the data in the column will be lost.
  - You are about to drop the column `externalOrganisationName` on the `accounting_connections` table. All the data in the column will be lost.
  - You are about to drop the column `invoiceExportTargetStatus` on the `accounting_connections` table. All the data in the column will be lost.
  - You are about to drop the column `accountingConnectionId` on the `accounting_contact_match_suggestions` table. All the data in the column will be lost.
  - You are about to drop the column `accountingConnectionId` on the `accounting_invoice_exports` table. All the data in the column will be lost.
  - You are about to drop the column `accountingConnectionId` on the `accounting_product_match_suggestions` table. All the data in the column will be lost.
  - You are about to drop the column `accountingConnectionId` on the `accounting_tax_type_match_suggestions` table. All the data in the column will be lost.
  - You are about to drop the column `accountingConnectionId` on the `customer_accounting_mappings` table. All the data in the column will be lost.
  - You are about to drop the column `accountingConnectionId` on the `external_accounting_contacts` table. All the data in the column will be lost.
  - You are about to drop the column `accountingConnectionId` on the `external_accounting_products` table. All the data in the column will be lost.
  - You are about to drop the column `accountingConnectionId` on the `external_accounting_tax_types` table. All the data in the column will be lost.
  - You are about to drop the column `accountingConnectionId` on the `product_accounting_mappings` table. All the data in the column will be lost.
  - You are about to drop the column `accountingConnectionId` on the `tax_type_accounting_mappings` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[accountingOrganisationId,orderId]` on the table `accounting_invoice_exports` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[accountingOrganisationId,externalInvoiceId]` on the table `accounting_invoice_exports` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[accountingOrganisationId,tradeRelationshipId,linkedMarker]` on the table `customer_accounting_mappings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[accountingOrganisationId,externalContactId,linkedMarker]` on the table `customer_accounting_mappings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[accountingOrganisationId,externalContactId]` on the table `external_accounting_contacts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[accountingOrganisationId,externalProductId]` on the table `external_accounting_products` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[accountingOrganisationId,taxType]` on the table `external_accounting_tax_types` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[accountingOrganisationId,productId,linkedMarker]` on the table `product_accounting_mappings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[accountingOrganisationId,externalProductId,linkedMarker]` on the table `product_accounting_mappings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[accountingOrganisationId,taxTypeId,linkedMarker]` on the table `tax_type_accounting_mappings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[accountingOrganisationId,externalTaxTypeId,linkedMarker]` on the table `tax_type_accounting_mappings` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `accountingOrganisationId` to the `accounting_bulk_import_jobs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountingOrganisationId` to the `accounting_connections` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountingOrganisationId` to the `accounting_contact_match_suggestions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountingOrganisationId` to the `accounting_invoice_exports` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountingOrganisationId` to the `accounting_product_match_suggestions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountingOrganisationId` to the `accounting_tax_type_match_suggestions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountingOrganisationId` to the `customer_accounting_mappings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountingOrganisationId` to the `external_accounting_contacts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountingOrganisationId` to the `external_accounting_products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountingOrganisationId` to the `external_accounting_tax_types` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountingOrganisationId` to the `product_accounting_mappings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountingOrganisationId` to the `tax_type_accounting_mappings` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "accounting_bulk_import_jobs" DROP CONSTRAINT "accounting_bulk_import_jobs_accountingConnectionId_fkey";

-- DropForeignKey
ALTER TABLE "accounting_contact_match_suggestions" DROP CONSTRAINT "accounting_contact_match_suggestions_accountingConnectionI_fkey";

-- DropForeignKey
ALTER TABLE "accounting_invoice_exports" DROP CONSTRAINT "accounting_invoice_exports_accountingConnectionId_fkey";

-- DropForeignKey
ALTER TABLE "accounting_product_match_suggestions" DROP CONSTRAINT "accounting_product_match_suggestions_accountingConnectionI_fkey";

-- DropForeignKey
ALTER TABLE "accounting_tax_type_match_suggestions" DROP CONSTRAINT "accounting_tax_type_match_suggestions_accountingConnection_fkey";

-- DropForeignKey
ALTER TABLE "customer_accounting_mappings" DROP CONSTRAINT "customer_accounting_mappings_accountingConnectionId_fkey";

-- DropForeignKey
ALTER TABLE "external_accounting_contacts" DROP CONSTRAINT "external_accounting_contacts_accountingConnectionId_fkey";

-- DropForeignKey
ALTER TABLE "external_accounting_products" DROP CONSTRAINT "external_accounting_products_accountingConnectionId_fkey";

-- DropForeignKey
ALTER TABLE "external_accounting_tax_types" DROP CONSTRAINT "external_accounting_tax_types_accountingConnectionId_fkey";

-- DropForeignKey
ALTER TABLE "product_accounting_mappings" DROP CONSTRAINT "product_accounting_mappings_accountingConnectionId_fkey";

-- DropForeignKey
ALTER TABLE "tax_type_accounting_mappings" DROP CONSTRAINT "tax_type_accounting_mappings_accountingConnectionId_fkey";

-- DropIndex
DROP INDEX "accounting_invoice_exports_accountingConnectionId_externalI_key";

-- DropIndex
DROP INDEX "accounting_invoice_exports_accountingConnectionId_orderId_key";

-- DropIndex
DROP INDEX "customer_accounting_mappings_accountingConnectionId_externa_key";

-- DropIndex
DROP INDEX "customer_accounting_mappings_accountingConnectionId_tradeRe_key";

-- DropIndex
DROP INDEX "external_accounting_contacts_accountingConnectionId_externa_key";

-- DropIndex
DROP INDEX "external_accounting_products_accountingConnectionId_externa_key";

-- DropIndex
DROP INDEX "external_accounting_tax_types_accountingConnectionId_taxTyp_key";

-- DropIndex
DROP INDEX "product_accounting_mappings_accountingConnectionId_external_key";

-- DropIndex
DROP INDEX "product_accounting_mappings_accountingConnectionId_productI_key";

-- DropIndex
DROP INDEX "tax_type_accounting_mappings_accountingConnectionId_externa_key";

-- DropIndex
DROP INDEX "tax_type_accounting_mappings_accountingConnectionId_taxType_key";

-- AlterTable
ALTER TABLE "accounting_bulk_import_jobs" DROP COLUMN "accountingConnectionId",
ADD COLUMN     "accountingOrganisationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "accounting_connections" DROP COLUMN "externalOrganisationId",
DROP COLUMN "externalOrganisationName",
DROP COLUMN "invoiceExportTargetStatus",
ADD COLUMN     "accountingOrganisationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "accounting_contact_match_suggestions" DROP COLUMN "accountingConnectionId",
ADD COLUMN     "accountingOrganisationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "accounting_invoice_exports" DROP COLUMN "accountingConnectionId",
ADD COLUMN     "accountingOrganisationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "accounting_product_match_suggestions" DROP COLUMN "accountingConnectionId",
ADD COLUMN     "accountingOrganisationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "accounting_tax_type_match_suggestions" DROP COLUMN "accountingConnectionId",
ADD COLUMN     "accountingOrganisationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "customer_accounting_mappings" DROP COLUMN "accountingConnectionId",
ADD COLUMN     "accountingOrganisationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "external_accounting_contacts" DROP COLUMN "accountingConnectionId",
ADD COLUMN     "accountingOrganisationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "external_accounting_products" DROP COLUMN "accountingConnectionId",
ADD COLUMN     "accountingOrganisationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "external_accounting_tax_types" DROP COLUMN "accountingConnectionId",
ADD COLUMN     "accountingOrganisationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "product_accounting_mappings" DROP COLUMN "accountingConnectionId",
ADD COLUMN     "accountingOrganisationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tax_type_accounting_mappings" DROP COLUMN "accountingConnectionId",
ADD COLUMN     "accountingOrganisationId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "accounting_organisations" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "externalOrganisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "invoiceExportTargetStatus" "AccountingInvoiceTargetStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_organisations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_organisations_distributorId_idx" ON "accounting_organisations"("distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_organisations_distributorId_provider_externalOrg_key" ON "accounting_organisations"("distributorId", "provider", "externalOrganisationId");

-- CreateIndex
CREATE INDEX "accounting_connections_accountingOrganisationId_idx" ON "accounting_connections"("accountingOrganisationId");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_invoice_exports_accountingOrganisationId_orderId_key" ON "accounting_invoice_exports"("accountingOrganisationId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_invoice_exports_accountingOrganisationId_externa_key" ON "accounting_invoice_exports"("accountingOrganisationId", "externalInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounting_mappings_accountingOrganisationId_trade_key" ON "customer_accounting_mappings"("accountingOrganisationId", "tradeRelationshipId", "linkedMarker");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounting_mappings_accountingOrganisationId_exter_key" ON "customer_accounting_mappings"("accountingOrganisationId", "externalContactId", "linkedMarker");

-- CreateIndex
CREATE UNIQUE INDEX "external_accounting_contacts_accountingOrganisationId_exter_key" ON "external_accounting_contacts"("accountingOrganisationId", "externalContactId");

-- CreateIndex
CREATE UNIQUE INDEX "external_accounting_products_accountingOrganisationId_exter_key" ON "external_accounting_products"("accountingOrganisationId", "externalProductId");

-- CreateIndex
CREATE UNIQUE INDEX "external_accounting_tax_types_accountingOrganisationId_taxT_key" ON "external_accounting_tax_types"("accountingOrganisationId", "taxType");

-- CreateIndex
CREATE UNIQUE INDEX "product_accounting_mappings_accountingOrganisationId_produc_key" ON "product_accounting_mappings"("accountingOrganisationId", "productId", "linkedMarker");

-- CreateIndex
CREATE UNIQUE INDEX "product_accounting_mappings_accountingOrganisationId_extern_key" ON "product_accounting_mappings"("accountingOrganisationId", "externalProductId", "linkedMarker");

-- CreateIndex
CREATE UNIQUE INDEX "tax_type_accounting_mappings_accountingOrganisationId_taxTy_key" ON "tax_type_accounting_mappings"("accountingOrganisationId", "taxTypeId", "linkedMarker");

-- CreateIndex
CREATE UNIQUE INDEX "tax_type_accounting_mappings_accountingOrganisationId_exter_key" ON "tax_type_accounting_mappings"("accountingOrganisationId", "externalTaxTypeId", "linkedMarker");

-- AddForeignKey
ALTER TABLE "accounting_connections" ADD CONSTRAINT "accounting_connections_accountingOrganisationId_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_organisations" ADD CONSTRAINT "accounting_organisations_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_accounting_contacts" ADD CONSTRAINT "external_accounting_contacts_accountingOrganisationId_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_accounting_mappings" ADD CONSTRAINT "customer_accounting_mappings_accountingOrganisationId_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_contact_match_suggestions" ADD CONSTRAINT "accounting_contact_match_suggestions_accountingOrganisatio_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_accounting_products" ADD CONSTRAINT "external_accounting_products_accountingOrganisationId_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_accounting_mappings" ADD CONSTRAINT "product_accounting_mappings_accountingOrganisationId_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_product_match_suggestions" ADD CONSTRAINT "accounting_product_match_suggestions_accountingOrganisatio_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_accounting_tax_types" ADD CONSTRAINT "external_accounting_tax_types_accountingOrganisationId_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_type_accounting_mappings" ADD CONSTRAINT "tax_type_accounting_mappings_accountingOrganisationId_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_tax_type_match_suggestions" ADD CONSTRAINT "accounting_tax_type_match_suggestions_accountingOrganisati_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_invoice_exports" ADD CONSTRAINT "accounting_invoice_exports_accountingOrganisationId_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_bulk_import_jobs" ADD CONSTRAINT "accounting_bulk_import_jobs_accountingOrganisationId_fkey" FOREIGN KEY ("accountingOrganisationId") REFERENCES "accounting_organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
