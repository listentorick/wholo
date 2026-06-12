/*
  Warnings:

  - The values [DRAFT,PLACED,CONFIRMED] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `customerId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the `order_items` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[orderNumber]` on the table `orders` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `acceptanceModeSnapshot` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `acceptanceModeSourceSnapshot` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orderNumber` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `placedByUserId` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subtotalAmount` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `taxAmount` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAmount` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `traderCustomerId` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CartOrderStatus" AS ENUM ('DRAFT');

-- CreateEnum
CREATE TYPE "OrderLineStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderAcceptanceMode" AS ENUM ('MANUAL', 'AUTO_ON_SUBMISSION');

-- CreateEnum
CREATE TYPE "AcceptanceModeSource" AS ENUM ('DISTRIBUTOR_DEFAULT', 'TRADER_CUSTOMER_OVERRIDE');

-- CreateEnum
CREATE TYPE "AcceptedByActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED');
ALTER TABLE "public"."orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_orderId_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_customerId_fkey";

-- DropIndex
DROP INDEX "orders_customerId_status_idx";

-- DropIndex
DROP INDEX "orders_distributorId_customerId_status_key";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "customerId",
ADD COLUMN     "acceptanceModeSnapshot" "OrderAcceptanceMode" NOT NULL,
ADD COLUMN     "acceptanceModeSourceSnapshot" "AcceptanceModeSource" NOT NULL,
ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedByActorType" "AcceptedByActorType",
ADD COLUMN     "acceptedByUserId" TEXT,
ADD COLUMN     "billingAddressSnapshot" JSONB,
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByUserId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'GBP',
ADD COLUMN     "customerReference" TEXT,
ADD COLUMN     "deliveryAddressSnapshot" JSONB,
ADD COLUMN     "fulfilmentStatus" TEXT,
ADD COLUMN     "invoiceStatus" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "orderNumber" TEXT NOT NULL,
ADD COLUMN     "paymentStatus" TEXT,
ADD COLUMN     "placedByUserId" TEXT NOT NULL,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedByUserId" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "subtotalAmount" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "taxAmount" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "totalAmount" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "traderCustomerId" TEXT NOT NULL,
ALTER COLUMN "status" DROP DEFAULT;

-- DropTable
DROP TABLE "order_items";

-- CreateTable
CREATE TABLE "cart_orders" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "CartOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "traderCustomerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "skuSnapshot" TEXT,
    "productNameSnapshot" TEXT NOT NULL,
    "unitOfMeasureSnapshot" TEXT,
    "quantityOrdered" INTEGER NOT NULL,
    "unitPriceSnapshot" DECIMAL(10,2) NOT NULL,
    "taxRateSnapshot" TEXT NOT NULL DEFAULT '0',
    "subtotalAmount" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "status" "OrderLineStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributor_settings" (
    "distributorId" TEXT NOT NULL,
    "defaultOrderAcceptanceMode" "OrderAcceptanceMode" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "distributor_settings_pkey" PRIMARY KEY ("distributorId")
);

-- CreateTable
CREATE TABLE "trader_customer_settings" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "traderCustomerId" TEXT NOT NULL,
    "tradeRelationshipId" TEXT,
    "orderAcceptanceModeOverride" "OrderAcceptanceMode",

    CONSTRAINT "trader_customer_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cart_orders_distributorId_status_idx" ON "cart_orders"("distributorId", "status");

-- CreateIndex
CREATE INDEX "cart_orders_customerId_status_idx" ON "cart_orders"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cart_orders_distributorId_customerId_status_key" ON "cart_orders"("distributorId", "customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cart_order_lines_orderId_productId_key" ON "cart_order_lines"("orderId", "productId");

-- CreateIndex
CREATE INDEX "order_lines_orderId_idx" ON "order_lines"("orderId");

-- CreateIndex
CREATE INDEX "order_lines_distributorId_idx" ON "order_lines"("distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "trader_customer_settings_distributorId_traderCustomerId_key" ON "trader_customer_settings"("distributorId", "traderCustomerId");

-- CreateIndex
CREATE INDEX "outbox_events_status_createdAt_idx" ON "outbox_events"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_traderCustomerId_status_idx" ON "orders"("traderCustomerId", "status");

-- CreateIndex
CREATE INDEX "orders_distributorId_createdAt_idx" ON "orders"("distributorId", "createdAt");

-- AddForeignKey
ALTER TABLE "cart_orders" ADD CONSTRAINT "cart_orders_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_orders" ADD CONSTRAINT "cart_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_order_lines" ADD CONSTRAINT "cart_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "cart_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_order_lines" ADD CONSTRAINT "cart_order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_traderCustomerId_fkey" FOREIGN KEY ("traderCustomerId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_settings" ADD CONSTRAINT "distributor_settings_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trader_customer_settings" ADD CONSTRAINT "trader_customer_settings_tradeRelationshipId_fkey" FOREIGN KEY ("tradeRelationshipId") REFERENCES "trade_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trader_customer_settings" ADD CONSTRAINT "trader_customer_settings_traderCustomerId_fkey" FOREIGN KEY ("traderCustomerId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
