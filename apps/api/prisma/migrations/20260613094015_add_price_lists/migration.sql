-- CreateEnum
CREATE TYPE "PriceListRuleSelectorType" AS ENUM ('ALL_PRODUCTS', 'PRODUCT');

-- AlterTable
ALTER TABLE "cart_order_lines" ADD COLUMN     "priceResolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedPriceListId" TEXT,
ADD COLUMN     "resolvedPriceListRuleId" TEXT;

-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "priceListIdSnapshot" TEXT,
ADD COLUMN     "priceListRuleIdSnapshot" TEXT;

-- AlterTable
ALTER TABLE "trader_customer_settings" ADD COLUMN     "priceListId" TEXT;

-- CreateTable
CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_rules" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "selectorType" "PriceListRuleSelectorType" NOT NULL,
    "productId" TEXT,
    "productVariantId" TEXT,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_list_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_lists_distributorId_active_idx" ON "price_lists"("distributorId", "active");

-- CreateIndex
CREATE INDEX "price_lists_distributorId_isDefault_idx" ON "price_lists"("distributorId", "isDefault");

-- CreateIndex
CREATE INDEX "price_list_rules_priceListId_active_idx" ON "price_list_rules"("priceListId", "active");

-- CreateIndex
CREATE INDEX "price_list_rules_priceListId_selectorType_productId_idx" ON "price_list_rules"("priceListId", "selectorType", "productId");

-- CreateIndex
CREATE INDEX "price_list_rules_distributorId_idx" ON "price_list_rules"("distributorId");

-- AddForeignKey
ALTER TABLE "trader_customer_settings" ADD CONSTRAINT "trader_customer_settings_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_rules" ADD CONSTRAINT "price_list_rules_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_rules" ADD CONSTRAINT "price_list_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
