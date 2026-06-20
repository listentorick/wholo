/*
  Warnings:

  - A unique constraint covering the columns `[adminUserId,tradeRelationshipId]` on the table `order_as_sessions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tradeRelationshipId` to the `order_as_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "order_as_sessions_adminUserId_customerId_distributorId_key";

-- AlterTable
ALTER TABLE "order_as_sessions" ADD COLUMN     "tradeRelationshipId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "order_as_sessions_adminUserId_tradeRelationshipId_key" ON "order_as_sessions"("adminUserId", "tradeRelationshipId");

-- AddForeignKey
ALTER TABLE "order_as_sessions" ADD CONSTRAINT "order_as_sessions_tradeRelationshipId_fkey" FOREIGN KEY ("tradeRelationshipId") REFERENCES "trade_relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
