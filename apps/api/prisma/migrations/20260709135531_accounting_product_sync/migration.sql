-- CreateEnum
CREATE TYPE "AccountingProductMatchStatus" AS ENUM ('SUGGESTED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AccountingProductMatchMethod" AS ENUM ('SKU_EXACT', 'SKU_NORMALISED', 'NAME_EXACT', 'NAME_FUZZY', 'MANUAL');

-- CreateTable
CREATE TABLE "external_accounting_products" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "accountingConnectionId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "externalProductCode" TEXT,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "salesUnitPrice" DECIMAL(12,4),
    "purchaseUnitPrice" DECIMAL(12,4),
    "taxCode" TEXT,
    "accountCode" TEXT,
    "purchaseTaxCode" TEXT,
    "purchaseAccountCode" TEXT,
    "isSold" BOOLEAN NOT NULL DEFAULT true,
    "isPurchased" BOOLEAN NOT NULL DEFAULT true,
    "isTracked" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "quantityOnHand" DECIMAL(12,4),
    "ignoredAt" TIMESTAMP(3),
    "lastExternalUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "rawProviderData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_accounting_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_accounting_mappings" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "accountingConnectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "matchMethod" "AccountingProductMatchMethod" NOT NULL,
    "linkedByUserId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_accounting_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_product_match_suggestions" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "accountingConnectionId" TEXT NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "suggestedProductId" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "matchMethod" "AccountingProductMatchMethod" NOT NULL,
    "matchReason" TEXT NOT NULL,
    "status" "AccountingProductMatchStatus" NOT NULL DEFAULT 'SUGGESTED',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_product_match_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_accounting_products_distributorId_isSold_isActive_idx" ON "external_accounting_products"("distributorId", "isSold", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "external_accounting_products_accountingConnectionId_externa_key" ON "external_accounting_products"("accountingConnectionId", "externalProductId");

-- CreateIndex
CREATE INDEX "product_accounting_mappings_distributorId_idx" ON "product_accounting_mappings"("distributorId");

-- CreateIndex
-- Partial: only one active (unlinkedAt IS NULL) mapping per pair, so an
-- unlink-then-relink of the same product/external product doesn't collide
-- with the closed-out row. Hand-added, same precedent as
-- customer_accounting_mappings — Prisma's schema DSL cannot express a
-- WHERE clause on a unique index.
CREATE UNIQUE INDEX "product_accounting_mappings_accountingConnectionId_productI_key"
ON "product_accounting_mappings"("accountingConnectionId", "productId")
WHERE "unlinkedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "product_accounting_mappings_accountingConnectionId_external_key"
ON "product_accounting_mappings"("accountingConnectionId", "externalProductId")
WHERE "unlinkedAt" IS NULL;

-- CreateIndex
CREATE INDEX "accounting_product_match_suggestions_distributorId_status_idx" ON "accounting_product_match_suggestions"("distributorId", "status");

-- CreateIndex
CREATE INDEX "accounting_product_match_suggestions_externalProductId_stat_idx" ON "accounting_product_match_suggestions"("externalProductId", "status");

-- AddForeignKey
ALTER TABLE "external_accounting_products" ADD CONSTRAINT "external_accounting_products_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_accounting_products" ADD CONSTRAINT "external_accounting_products_accountingConnectionId_fkey" FOREIGN KEY ("accountingConnectionId") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_accounting_mappings" ADD CONSTRAINT "product_accounting_mappings_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_accounting_mappings" ADD CONSTRAINT "product_accounting_mappings_accountingConnectionId_fkey" FOREIGN KEY ("accountingConnectionId") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_accounting_mappings" ADD CONSTRAINT "product_accounting_mappings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_accounting_mappings" ADD CONSTRAINT "product_accounting_mappings_externalProductId_fkey" FOREIGN KEY ("externalProductId") REFERENCES "external_accounting_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_product_match_suggestions" ADD CONSTRAINT "accounting_product_match_suggestions_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_product_match_suggestions" ADD CONSTRAINT "accounting_product_match_suggestions_accountingConnectionI_fkey" FOREIGN KEY ("accountingConnectionId") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_product_match_suggestions" ADD CONSTRAINT "accounting_product_match_suggestions_externalProductId_fkey" FOREIGN KEY ("externalProductId") REFERENCES "external_accounting_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_product_match_suggestions" ADD CONSTRAINT "accounting_product_match_suggestions_suggestedProductId_fkey" FOREIGN KEY ("suggestedProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

