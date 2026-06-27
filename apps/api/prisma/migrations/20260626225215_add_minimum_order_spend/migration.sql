-- AlterTable
ALTER TABLE "distributor_settings" ADD COLUMN     "minimumOrderSpend" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "trade_relationships" ADD COLUMN     "minimumOrderSpend" DECIMAL(10,2);
