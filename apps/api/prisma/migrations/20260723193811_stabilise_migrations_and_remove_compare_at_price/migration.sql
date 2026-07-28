/*
  Warnings:

  - You are about to drop the column `compareAtPrice` on the `products` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[connectedDistributorId]` on the table `accounting_connections` will be added.
  - A unique constraint covering the columns `[accountingConnectionId,tradeRelationshipId,linkedMarker]` on the table `customer_accounting_mappings` will be added.
  - A unique constraint covering the columns `[accountingConnectionId,externalContactId,linkedMarker]` on the table `customer_accounting_mappings` will be added.
  - A unique constraint covering the columns `[accountingConnectionId,productId,linkedMarker]` on the table `product_accounting_mappings` will be added.
  - A unique constraint covering the columns `[accountingConnectionId,externalProductId,linkedMarker]` on the table `product_accounting_mappings` will be added.
  - A unique constraint covering the columns `[distributorId,activeAccountNumber]` on the table `trade_relationships` will be added.

  These are backfilled below from existing data using the same condition the
  old partial indexes enforced, so none of the four can fail on duplicates —
  the old partial index already guaranteed at most one qualifying row per
  key. See ADR-052.
*/

-- Timescale's create_hypertable() auto-creates these; Prisma doesn't know
-- that and drops+recreates them identically now that they're declared via
-- @@index. Harmless (plain perf index, not a constraint).
-- DropIndex
DROP INDEX "order_facts_occurredAt_idx";

-- DropIndex
DROP INDEX "order_line_facts_occurredAt_idx";

-- AlterTable
ALTER TABLE "accounting_connections" ADD COLUMN     "connectedDistributorId" TEXT;

-- AlterTable
ALTER TABLE "customer_accounting_mappings" ADD COLUMN     "linkedMarker" BOOLEAN;

-- AlterTable
ALTER TABLE "product_accounting_mappings" ADD COLUMN     "linkedMarker" BOOLEAN;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "compareAtPrice";

-- AlterTable
ALTER TABLE "trade_relationships" ADD COLUMN     "activeAccountNumber" TEXT;

-- Backfill (hand-added data migration, not a schema construct — see ADR-052):
-- populate the new marker columns from existing data using the exact
-- condition the old partial indexes enforced.
UPDATE "accounting_connections" SET "connectedDistributorId" = "distributorId" WHERE "status" = 'CONNECTED';
UPDATE "trade_relationships" SET "activeAccountNumber" = "accountNumber" WHERE "deletedAt" IS NULL;
UPDATE "customer_accounting_mappings" SET "linkedMarker" = true WHERE "unlinkedAt" IS NULL;
UPDATE "product_accounting_mappings" SET "linkedMarker" = true WHERE "unlinkedAt" IS NULL;

-- Drop the old hand-written partial indexes now superseded by the plain
-- unique indexes below (see ADR-052). Required, not just cleanup: the two
-- mapping tables' new indexes reuse these exact same auto-generated names.
DROP INDEX "unique_active_accounting_connection";
DROP INDEX "unique_active_account_number";
DROP INDEX "customer_accounting_mappings_accountingConnectionId_tradeRe_key";
DROP INDEX "customer_accounting_mappings_accountingConnectionId_externa_key";
DROP INDEX "product_accounting_mappings_accountingConnectionId_productI_key";
DROP INDEX "product_accounting_mappings_accountingConnectionId_external_key";

-- CreateIndex
CREATE UNIQUE INDEX "accounting_connections_connectedDistributorId_key" ON "accounting_connections"("connectedDistributorId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounting_mappings_accountingConnectionId_tradeRe_key" ON "customer_accounting_mappings"("accountingConnectionId", "tradeRelationshipId", "linkedMarker");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounting_mappings_accountingConnectionId_externa_key" ON "customer_accounting_mappings"("accountingConnectionId", "externalContactId", "linkedMarker");

-- CreateIndex
CREATE INDEX "order_facts_occurredAt_idx" ON "order_facts"("occurredAt");

-- CreateIndex
CREATE INDEX "order_line_facts_occurredAt_idx" ON "order_line_facts"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_accounting_mappings_accountingConnectionId_productI_key" ON "product_accounting_mappings"("accountingConnectionId", "productId", "linkedMarker");

-- CreateIndex
CREATE UNIQUE INDEX "product_accounting_mappings_accountingConnectionId_external_key" ON "product_accounting_mappings"("accountingConnectionId", "externalProductId", "linkedMarker");

-- CreateIndex
CREATE UNIQUE INDEX "trade_relationships_distributorId_activeAccountNumber_key" ON "trade_relationships"("distributorId", "activeAccountNumber");
