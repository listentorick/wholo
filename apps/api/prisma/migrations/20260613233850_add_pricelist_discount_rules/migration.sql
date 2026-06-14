-- CreateEnum
CREATE TYPE "PriceListRuleValueType" AS ENUM ('FIXED_PRICE', 'PERCENTAGE_DISCOUNT');

-- CreateEnum
CREATE TYPE "PriceListRuleDiscountBaseType" AS ENUM ('PRODUCT_PRICE', 'PRICE_LIST');

-- AlterTable
ALTER TABLE "price_list_rules" ADD COLUMN     "basePriceListId" TEXT,
ADD COLUMN     "discountBaseType" "PriceListRuleDiscountBaseType",
ADD COLUMN     "discountPercentage" DECIMAL(5,2),
ADD COLUMN     "valueType" "PriceListRuleValueType" NOT NULL DEFAULT 'FIXED_PRICE',
ALTER COLUMN "unitPrice" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "price_list_rules" ADD CONSTRAINT "price_list_rules_basePriceListId_fkey" FOREIGN KEY ("basePriceListId") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
