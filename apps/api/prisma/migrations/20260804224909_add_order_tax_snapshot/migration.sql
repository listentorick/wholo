-- AlterTable
ALTER TABLE "cart_order_lines" ADD COLUMN     "taxRateSnapshot" DECIMAL(5,2),
ADD COLUMN     "taxTypeId" TEXT;

-- AlterTable
ALTER TABLE "order_lines" DROP COLUMN "taxRateSnapshot",
ADD COLUMN     "taxClassificationSnapshot" "TaxClassification",
ADD COLUMN     "taxRatePercentageSnapshot" DECIMAL(5,2),
ADD COLUMN     "taxTypeId" TEXT,
ADD COLUMN     "taxTypeNameSnapshot" TEXT;

