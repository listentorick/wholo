/*
  Warnings:

  - You are about to drop the column `distributorId` on the `trader_customer_settings` table. All the data in the column will be lost.
  - You are about to drop the column `traderCustomerId` on the `trader_customer_settings` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tradeRelationshipId]` on the table `trader_customer_settings` will be added. If there are existing duplicate values, this will fail.
  - Made the column `tradeRelationshipId` on table `trader_customer_settings` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "trader_customer_settings" DROP CONSTRAINT "trader_customer_settings_tradeRelationshipId_fkey";

-- DropForeignKey
ALTER TABLE "trader_customer_settings" DROP CONSTRAINT "trader_customer_settings_traderCustomerId_fkey";

-- DropIndex
DROP INDEX "trader_customer_settings_distributorId_traderCustomerId_key";

-- AlterTable
ALTER TABLE "trader_customer_settings" DROP COLUMN "distributorId",
DROP COLUMN "traderCustomerId",
ALTER COLUMN "tradeRelationshipId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "trader_customer_settings_tradeRelationshipId_key" ON "trader_customer_settings"("tradeRelationshipId");

-- AddForeignKey
ALTER TABLE "trader_customer_settings" ADD CONSTRAINT "trader_customer_settings_tradeRelationshipId_fkey" FOREIGN KEY ("tradeRelationshipId") REFERENCES "trade_relationships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
