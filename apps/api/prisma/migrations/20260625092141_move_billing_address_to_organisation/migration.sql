/*
  Warnings:

  - You are about to drop the column `billingCity` on the `trade_relationships` table. All the data in the column will be lost.
  - You are about to drop the column `billingCountry` on the `trade_relationships` table. All the data in the column will be lost.
  - You are about to drop the column `billingLine1` on the `trade_relationships` table. All the data in the column will be lost.
  - You are about to drop the column `billingLine2` on the `trade_relationships` table. All the data in the column will be lost.
  - You are about to drop the column `billingPostcode` on the `trade_relationships` table. All the data in the column will be lost.
  - You are about to drop the column `billingState` on the `trade_relationships` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "billingCity" TEXT,
ADD COLUMN     "billingCountry" TEXT,
ADD COLUMN     "billingLine1" TEXT,
ADD COLUMN     "billingLine2" TEXT,
ADD COLUMN     "billingPostcode" TEXT,
ADD COLUMN     "billingState" TEXT;

-- AlterTable
ALTER TABLE "trade_relationships" DROP COLUMN "billingCity",
DROP COLUMN "billingCountry",
DROP COLUMN "billingLine1",
DROP COLUMN "billingLine2",
DROP COLUMN "billingPostcode",
DROP COLUMN "billingState";
