-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryLinkToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_deliveryLinkToken_key" ON "orders"("deliveryLinkToken");

