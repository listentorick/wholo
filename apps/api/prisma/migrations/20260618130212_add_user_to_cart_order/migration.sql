/*
  Warnings:

  - A unique constraint covering the columns `[distributorId,customerId,userId,status]` on the table `cart_orders` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `cart_orders` table without a default value. This is not possible if the table is not empty.

*/
-- Clear ephemeral cart data — carts are deleted on order submission, dev rows are safe to discard
DELETE FROM "cart_order_lines";
DELETE FROM "cart_orders";

-- DropIndex
DROP INDEX "cart_orders_distributorId_customerId_status_key";

-- AlterTable
ALTER TABLE "cart_orders" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "cart_orders_distributorId_customerId_userId_status_key" ON "cart_orders"("distributorId", "customerId", "userId", "status");

-- AddForeignKey
ALTER TABLE "cart_orders" ADD CONSTRAINT "cart_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
